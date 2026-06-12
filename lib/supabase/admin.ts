import { createClient } from '@supabase/supabase-js'

// Client service-role : bypasse la RLS Postgres.
// À n'utiliser QUE dans les routes serveur, après contrôle d'autorisation applicatif
// (voir lib/auth.ts). Ne jamais exposer la clé au navigateur.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
