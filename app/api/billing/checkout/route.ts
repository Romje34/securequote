import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { getStripe, stripeConfigured } from '@/lib/stripe'

// POST — démarre un abonnement Stripe pour le forfait choisi (auto-service owner).
// Crée (ou réutilise) le client Stripe de l'organisation puis renvoie l'URL
// de la page de paiement hébergée par Stripe (Checkout, mode subscription).
export async function POST(request: Request) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { user, db } = auth

  if (!stripeConfigured()) {
    return NextResponse.json({ error: 'Paiement non configuré' }, { status: 503 })
  }

  const { plan_id } = await request.json().catch(() => ({}))
  if (!plan_id) return NextResponse.json({ error: 'plan_id requis' }, { status: 400 })

  // Profil (gating owner) et forfait sont indépendants → requêtes en parallèle.
  const [{ data: profile }, { data: plan }] = await Promise.all([
    db.from('profiles').select('organization_id, user_type').eq('id', user.id).single(),
    db.from('plans').select('id, name, stripe_price_id').eq('id', plan_id).maybeSingle(),
  ])

  // Seul un owner (integrator) rattaché à une organisation peut souscrire.
  if (profile?.user_type !== 'integrator') {
    return NextResponse.json({ error: 'Réservé au titulaire du compte' }, { status: 403 })
  }
  if (!profile?.organization_id) {
    return NextResponse.json({ error: 'Aucune organisation' }, { status: 409 })
  }

  // Forfait + prix Stripe associé.
  if (!plan) return NextResponse.json({ error: 'Forfait introuvable' }, { status: 404 })
  if (!plan.stripe_price_id) {
    return NextResponse.json({ error: 'Forfait non disponible à la vente' }, { status: 409 })
  }

  const { data: org } = await db
    .from('organizations')
    .select('id, name, stripe_customer_id')
    .eq('id', profile.organization_id)
    .single()
  if (!org) return NextResponse.json({ error: 'Organisation introuvable' }, { status: 404 })

  const stripe = getStripe()

  // Un seul client Stripe par organisation : créé au 1er checkout, réutilisé ensuite.
  let customerId = org.stripe_customer_id as string | null
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      name: org.name ?? undefined,
      metadata: { organization_id: org.id },
    })
    customerId = customer.id
    await db.from('organizations').update({ stripe_customer_id: customerId }).eq('id', org.id)
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
    // Permet au webhook de retrouver l'org et le forfait visé.
    client_reference_id: org.id,
    subscription_data: { metadata: { organization_id: org.id, plan_id: plan.id } },
    metadata: { organization_id: org.id, plan_id: plan.id },
    allow_promotion_codes: true,
    success_url: `${appUrl}/settings?checkout=success`,
    cancel_url: `${appUrl}/settings?checkout=cancel`,
  })

  return NextResponse.json({ url: session.url })
}
