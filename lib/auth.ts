import { NextResponse } from 'next/server'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Contexte renvoyé après authentification réussie :
//  - user : l'utilisateur connecté (session vérifiée côté serveur)
//  - db   : client service-role pour les requêtes (autorisation déjà gérée ici)
export type AuthContext = { user: User; db: SupabaseClient }

// Garde d'authentification. Renvoie soit le contexte, soit une réponse 401.
// Usage : const ctx = await requireUser(); if (ctx instanceof NextResponse) return ctx
export async function requireUser(): Promise<AuthContext | NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  return { user, db: createAdminClient() }
}

// Garde super-administrateur. Renvoie le contexte ou une réponse 403.
export async function requireSuperAdmin(): Promise<AuthContext | NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  const db = createAdminClient()
  const { data: profile } = await db.from('profiles').select('user_type').eq('id', user.id).single()
  if (profile?.user_type !== 'superadmin') {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }
  return { user, db }
}

// Sociétés accessibles au user : ses propres sociétés (owner) + celles des membres
// qu'il a invités (rollup). Source de vérité partagée par la liste des devis et les
// contrôles unitaires d'accès, pour garantir une visibilité cohérente.
export async function accessibleCompanyIds(db: SupabaseClient, userId: string): Promise<string[]> {
  const { data: owned } = await db
    .from('company_members')
    .select('company_id')
    .eq('user_id', userId)
    .eq('role', 'owner')

  const ids = new Set<string>((owned ?? []).map(r => r.company_id as string))

  const { data: invited } = await db
    .from('profiles')
    .select('id')
    .eq('invited_by', userId)
  const memberIds = (invited ?? []).map(p => p.id as string)

  if (memberIds.length > 0) {
    const { data: memberOwned } = await db
      .from('company_members')
      .select('company_id')
      .in('user_id', memberIds)
      .eq('role', 'owner')
    for (const r of memberOwned ?? []) ids.add(r.company_id as string)
  }

  return [...ids]
}

// Autorisation d'accès à une société donnée.
export async function userCanAccessCompany(db: SupabaseClient, userId: string, companyId: string): Promise<boolean> {
  const ids = await accessibleCompanyIds(db, userId)
  return ids.includes(companyId)
}

// Autorisation d'accès à un devis : true si le devis appartient à une société accessible.
// Renvoie aussi le devis chargé (company_id) pour éviter une seconde requête côté appelant.
export async function userCanAccessQuote(
  db: SupabaseClient,
  userId: string,
  quoteId: string,
): Promise<{ allowed: boolean; companyId: string | null }> {
  const { data: quote } = await db
    .from('quotes')
    .select('company_id')
    .eq('id', quoteId)
    .maybeSingle()
  if (!quote) return { allowed: false, companyId: null }
  const ids = await accessibleCompanyIds(db, userId)
  return { allowed: ids.includes(quote.company_id as string), companyId: quote.company_id as string }
}

// Résout le devis parent d'un chapitre, puis vérifie l'accès.
export async function userCanAccessChapter(db: SupabaseClient, userId: string, chapterId: string): Promise<boolean> {
  const { data: chapter } = await db
    .from('quote_chapters')
    .select('quote_id')
    .eq('id', chapterId)
    .maybeSingle()
  if (!chapter) return false
  return (await userCanAccessQuote(db, userId, chapter.quote_id as string)).allowed
}

// Résout le devis parent d'une ligne (item -> chapitre -> devis), puis vérifie l'accès.
export async function userCanAccessItem(db: SupabaseClient, userId: string, itemId: string): Promise<boolean> {
  const { data: item } = await db
    .from('quote_items')
    .select('chapter_id')
    .eq('id', itemId)
    .maybeSingle()
  if (!item) return false
  return userCanAccessChapter(db, userId, item.chapter_id as string)
}
