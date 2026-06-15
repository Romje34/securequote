import { type NextRequest, NextResponse } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

// GET — point d'atterrissage des liens d'email (confirmation d'inscription et
// réinitialisation de mot de passe). Vérifie le token (verifyOtp) côté serveur,
// ce qui confirme l'email et ouvre la session, puis redirige vers `next`.
//
// Route publique (préfixe /auth autorisé dans proxy.ts) : l'utilisateur n'est
// pas encore connecté au moment du clic.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const nextParam = searchParams.get('next') || '/dashboard'
  // Anti open-redirect : on n'accepte que des chemins internes.
  const next = nextParam.startsWith('/') ? nextParam : '/dashboard'

  if (!tokenHash || !type) {
    return NextResponse.redirect(`${origin}/login?error=lien_invalide`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=lien_expire`)
  }

  return NextResponse.redirect(`${origin}${next}`)
}
