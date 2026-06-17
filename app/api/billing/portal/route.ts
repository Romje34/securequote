import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { getStripe, stripeConfigured } from '@/lib/stripe'

// POST — ouvre le portail client Stripe (gestion de l'abonnement : changer de
// forfait, mettre à jour la carte, résilier). Renvoie l'URL hébergée par Stripe.
export async function POST() {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { user, db } = auth

  if (!stripeConfigured()) {
    return NextResponse.json({ error: 'Paiement non configuré' }, { status: 503 })
  }

  const { data: profile } = await db
    .from('profiles')
    .select('organization_id, user_type')
    .eq('id', user.id)
    .single()

  if (profile?.user_type !== 'integrator' || !profile?.organization_id) {
    return NextResponse.json({ error: 'Réservé au titulaire du compte' }, { status: 403 })
  }

  const { data: org } = await db
    .from('organizations')
    .select('stripe_customer_id')
    .eq('id', profile.organization_id)
    .single()

  const customerId = org?.stripe_customer_id as string | null
  if (!customerId) {
    return NextResponse.json({ error: 'Aucun abonnement actif' }, { status: 409 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const session = await getStripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${appUrl}/settings`,
  })

  return NextResponse.json({ url: session.url })
}
