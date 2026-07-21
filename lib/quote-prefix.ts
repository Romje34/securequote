import type { SupabaseClient } from '@supabase/supabase-js'

// Préfixe devis = 3 premières lettres du nom de l'organisation (tenant) du user.
// Owners et members partagent le même organization_id → même préfixe.
function prefixFromName(name: string | null | undefined): string {
  if (!name) return 'DEV'
  const diacritics = new RegExp('[\\u0300-\\u036f]', 'g')   // marques d'accent combinantes
  const cleaned = name
    .normalize('NFD').replace(diacritics, '')                // Sécurité → Securite
    .replace(/[^a-zA-Z0-9]/g, '')                            // garde lettres/chiffres uniquement
    .toUpperCase()
  return cleaned.length >= 1 ? cleaned.slice(0, 3) : 'DEV'
}

export async function orgQuotePrefix(db: SupabaseClient, userId: string): Promise<string> {
  const { data: profile } = await db
    .from('profiles')
    .select('organization_id')
    .eq('id', userId)
    .maybeSingle()

  if (!profile?.organization_id) return 'DEV'

  const { data: org } = await db
    .from('organizations')
    .select('name')
    .eq('id', profile.organization_id)
    .maybeSingle()

  return prefixFromName(org?.name)
}
