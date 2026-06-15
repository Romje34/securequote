import { NextResponse } from 'next/server'
import { createAdminClient as adm } from '@/lib/supabase/admin'
import { checkRateLimit, clientIp } from '@/lib/rate-limit'
import { verifyTurnstile } from '@/lib/turnstile'
import { sendSignupConfirmationEmail } from '@/lib/email'

// POST public — auto-inscription d'un owner avec sa société.
//
// Règle FERME : aucun compte sans organisation ET sans email vérifié.
//  - organisation : la raison sociale est obligatoire (créée ici).
//  - email vérifié : le compte est créé NON confirmé ; on envoie un lien de
//    confirmation. La connexion est impossible tant que l'email n'est pas validé
//    (réglage Supabase « Confirm email » = ON).
// Anti-abus : Cloudflare Turnstile + rate limiting par IP.
export async function POST(request: Request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY manquante' }, { status: 500 })
  }

  const body = await request.json().catch(() => ({}))
  const { email, password, company_name, siret, address, postal_code, city, country, phone, company_email } = body
  const turnstileToken = body.turnstile_token

  if (!email || !password) {
    return NextResponse.json({ error: 'Email et mot de passe requis' }, { status: 400 })
  }
  if (!company_name?.trim()) {
    return NextResponse.json({ error: 'La raison sociale est obligatoire' }, { status: 400 })
  }

  // Anti-robot : vérification du token Turnstile (fail-open si clé non configurée).
  const human = await verifyTurnstile(turnstileToken, clientIp(request))
  if (!human) {
    return NextResponse.json({ error: 'Vérification anti-robot échouée. Rechargez la page et réessayez.' }, { status: 400 })
  }

  const db = adm()

  // Anti-abus : on borne les créations de compte par IP (5 par heure).
  const allowed = await checkRateLimit(db, `signup:${clientIp(request)}`, 5, 3600)
  if (!allowed) {
    return NextResponse.json(
      { error: 'Trop de tentatives de création de compte. Réessayez dans une heure.' },
      { status: 429 },
    )
  }

  const orgFields = {
    name:        company_name.trim(),
    siret:       siret         || null,
    address:     address       || null,
    postal_code: postal_code   || null,
    city:        city          || null,
    country:     country       || 'France',
    phone:       phone         || null,
    email:       company_email || null,
  }

  // Crée le compte NON confirmé et génère le lien de confirmation en une étape.
  // generateLink (type 'signup') crée l'utilisateur s'il n'existe pas et renvoie
  // le token de confirmation, sans envoyer d'email (on l'envoie nous-mêmes via Resend).
  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin
  const { data: linkData, error: linkError } = await db.auth.admin.generateLink({
    type: 'signup',
    email,
    password,
  })

  if (linkError || !linkData?.user || !linkData.properties?.hashed_token) {
    const msg = (linkError?.message ?? '').toLowerCase()
    if (msg.includes('already') || msg.includes('registered') || msg.includes('existe')) {
      return NextResponse.json({ error: 'Un compte existe déjà avec cet email.' }, { status: 409 })
    }
    return NextResponse.json({ error: linkError?.message ?? 'Erreur lors de la création du compte' }, { status: 400 })
  }

  const newUserId = linkData.user.id

  // Crée l'organisation (sans forfait → essai gratuit).
  const { data: org, error: orgError } = await db
    .from('organizations')
    .insert(orgFields)
    .select('id')
    .single()

  if (orgError) {
    await db.auth.admin.deleteUser(newUserId)
    return NextResponse.json({ error: `Erreur organisation : ${orgError.message}` }, { status: 500 })
  }

  // Promeut le profil en owner rattaché à son organisation.
  const { error: profileError } = await db.from('profiles').update({
    user_type:       'integrator',
    organization_id: org.id,
  }).eq('id', newUserId)

  if (profileError) {
    await db.from('organizations').delete().eq('id', org.id)
    await db.auth.admin.deleteUser(newUserId)
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }

  // Envoie l'email de confirmation. En cas d'échec d'envoi, on annule tout pour ne
  // pas laisser un compte non confirmable (cohérent avec la règle « pas de compte
  // sans email vérifié »).
  const confirmUrl = `${origin}/auth/confirm?token_hash=${linkData.properties.hashed_token}&type=signup&next=/dashboard`
  try {
    await sendSignupConfirmationEmail({ to: email, confirmUrl })
  } catch (err) {
    await db.from('organizations').delete().eq('id', org.id)
    await db.auth.admin.deleteUser(newUserId)
    const detail = err instanceof Error ? err.message : 'inconnue'
    return NextResponse.json(
      { error: `Impossible d'envoyer l'email de confirmation (${detail}). Réessayez plus tard.` },
      { status: 502 },
    )
  }

  return NextResponse.json(
    { needs_confirmation: true, email, organization_name: orgFields.name },
    { status: 201 },
  )
}
