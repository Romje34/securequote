import Stripe from 'stripe'

// Client Stripe serveur (jamais exposé au navigateur).
// La clé secrète est lue paresseusement pour ne pas faire échouer le build
// quand STRIPE_SECRET_KEY n'est pas encore renseignée.
let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) throw new Error('STRIPE_SECRET_KEY manquante')
    _stripe = new Stripe(key)
  }
  return _stripe
}

// Présence de la configuration Stripe (clé secrète). Permet de dégrader
// gracieusement l'UI/les routes tant que le compte n'est pas branché.
export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY)
}
