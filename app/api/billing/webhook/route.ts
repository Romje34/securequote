import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { getStripe, stripeConfigured } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'

// Webhook Stripe — source de vérité de l'abonnement.
// Stripe POST ici à chaque changement ; on met à jour organizations
// (plan_id = déblocage IA, statut, identifiants). Aucune session utilisateur :
// l'authenticité est garantie par la signature (STRIPE_WEBHOOK_SECRET).

// Statuts Stripe considérés comme « abonnement actif » (IA débloquée).
const ACTIVE = new Set(['active', 'trialing'])

// Applique l'état d'un abonnement Stripe à l'organisation correspondante.
async function syncSubscription(sub: Stripe.Subscription) {
  const db = createAdminClient()

  // L'org est portée par les métadonnées de l'abonnement, sinon retrouvée
  // via le client Stripe (cas d'un abonnement créé hors de notre checkout).
  let orgId = sub.metadata?.organization_id ?? null
  if (!orgId) {
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
    const { data: org } = await db
      .from('organizations')
      .select('id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle()
    orgId = org?.id ?? null
  }
  if (!orgId) return

  // Forfait déduit du prix de l'abonnement (gère les changements via le portail).
  const priceId = sub.items.data[0]?.price?.id ?? null
  let planId: string | null = null
  if (priceId) {
    const { data: plan } = await db
      .from('plans')
      .select('id')
      .eq('stripe_price_id', priceId)
      .maybeSingle()
    planId = plan?.id ?? null
  }

  const active = ACTIVE.has(sub.status)

  await db
    .from('organizations')
    .update({
      stripe_subscription_id: sub.id,
      subscription_status: sub.status,
      // Abonnement actif → forfait débloqué ; sinon retour à l'essai gratuit.
      plan_id: active ? planId : null,
    })
    .eq('id', orgId)
}

export async function POST(request: Request) {
  if (!stripeConfigured()) {
    return NextResponse.json({ error: 'Paiement non configuré' }, { status: 503 })
  }
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'STRIPE_WEBHOOK_SECRET manquante' }, { status: 503 })
  }

  const signature = request.headers.get('stripe-signature')
  if (!signature) return NextResponse.json({ error: 'Signature manquante' }, { status: 400 })

  // Corps BRUT obligatoire pour la vérification de signature.
  const payload = await request.text()
  const stripe = getStripe()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(payload, signature, secret)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'invalide'
    return NextResponse.json({ error: `Signature invalide: ${msg}` }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.subscription) {
          const subId = typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription.id
          const sub = await stripe.subscriptions.retrieve(subId)
          await syncSubscription(sub)
        }
        break
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        await syncSubscription(event.data.object as Stripe.Subscription)
        break
      }
      default:
        // Événement non traité : accusé de réception pour éviter les relances.
        break
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'erreur'
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
