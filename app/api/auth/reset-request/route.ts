import { NextResponse } from 'next/server'
import { createAdminClient as adm } from '@/lib/supabase/admin'
import { checkRateLimit, clientIp } from '@/lib/rate-limit'
import { verifyTurnstile } from '@/lib/turnstile'
import { sendPasswordResetEmail } from '@/lib/email'

// POST public — demande de réinitialisation de mot de passe.
// Anti-bot (Turnstile) + rate limiting par IP. Anti-énumération : on renvoie
// toujours la même réponse 200, qu'un compte existe ou non pour cet email.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const email = (body.email ?? '').toString().trim().toLowerCase()
  const turnstileToken = body.turnstile_token

  if (!email) {
    return NextResponse.json({ error: 'Email requis' }, { status: 400 })
  }

  const human = await verifyTurnstile(turnstileToken, clientIp(request))
  if (!human) {
    return NextResponse.json({ error: 'Vérification anti-robot échouée. Rechargez la page et réessayez.' }, { status: 400 })
  }

  const db = adm()
  const allowed = await checkRateLimit(db, `reset:${clientIp(request)}`, 5, 3600)
  if (!allowed) {
    return NextResponse.json({ error: 'Trop de demandes. Réessayez dans une heure.' }, { status: 429 })
  }

  // generateLink (type 'recovery') ne crée pas de compte : il échoue silencieusement
  // si l'email n'existe pas. On n'expose jamais cette information.
  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin
  const { data, error } = await db.auth.admin.generateLink({ type: 'recovery', email })

  if (!error && data?.properties?.hashed_token) {
    const resetUrl = `${origin}/auth/confirm?token_hash=${data.properties.hashed_token}&type=recovery&next=/reset`
    try {
      await sendPasswordResetEmail({ to: email, resetUrl })
    } catch (err) {
      console.error('[reset-request] envoi email échoué:', err)
    }
  }

  return NextResponse.json({ ok: true })
}
