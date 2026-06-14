import type { SupabaseClient } from '@supabase/supabase-js'

// Extrait l'IP cliente à partir des en-têtes (Vercel renseigne x-forwarded-for).
// Fallback 'unknown' en local : toutes les requêtes sans IP partagent alors le bucket.
export function clientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  return request.headers.get('x-real-ip')?.trim() || 'unknown'
}

// Vérifie et incrémente un compteur à fenêtre glissante côté Postgres (atomique via RPC).
// Renvoie true si la requête est autorisée, false si la limite est atteinte.
//
// Fail-open : en cas d'erreur (ex. migration non encore appliquée), on autorise, pour
// ne pas casser le service — le rate limiting est une protection anti-abus, pas un
// contrôle d'accès (lequel est géré dans lib/auth.ts).
export async function checkRateLimit(
  db: SupabaseClient,
  bucket: string,
  max: number,
  windowSeconds: number,
): Promise<boolean> {
  const { data, error } = await db.rpc('rate_limit_check', {
    p_bucket: bucket,
    p_max: max,
    p_window_seconds: windowSeconds,
  })
  if (error) {
    console.error('[rate-limit] RPC error (fail-open):', error.message)
    return true
  }
  return data !== false
}
