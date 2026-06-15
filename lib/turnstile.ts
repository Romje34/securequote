// Vérification serveur d'un token Cloudflare Turnstile (anti-bot / anti-robot).
//
// Fail-open si TURNSTILE_SECRET_KEY n'est pas configurée (ex. dev local) : on
// n'interrompt pas le service. En production la clé DOIT être posée dans les
// variables d'environnement, sinon la protection est silencieusement inactive.
export async function verifyTurnstile(
  token: string | null | undefined,
  ip?: string | null,
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) {
    console.warn('[turnstile] TURNSTILE_SECRET_KEY absente — vérification ignorée (fail-open)')
    return true
  }
  if (!token) return false

  try {
    const form = new URLSearchParams()
    form.append('secret', secret)
    form.append('response', token)
    if (ip) form.append('remoteip', ip)

    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
    })
    const data = (await res.json().catch(() => ({ success: false }))) as { success?: boolean }
    return data.success === true
  } catch (err) {
    console.error('[turnstile] erreur de vérification:', err)
    return false
  }
}
