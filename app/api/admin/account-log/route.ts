import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth'

// GET (superadmin) — journal des utilisateurs : pour chaque organisation, la liste
// des comptes (owners ET membres) DONT L'EMAIL A ÉTÉ VALIDÉ. Dès qu'un utilisateur
// confirme son email (via le lien d'inscription ou d'invitation), il apparaît ici.
// Statut dérivé de la source de vérité Supabase (created_at, email_confirmed_at,
// last_sign_in_at).
export async function GET() {
  const auth = await requireSuperAdmin()
  if (auth instanceof NextResponse) return auth
  const { db } = auth

  // Owners (integrator) + membres (client).
  const { data: profiles } = await db
    .from('profiles')
    .select('id, organization_id, user_type')
    .in('user_type', ['integrator', 'client'])

  const orgIds = [...new Set((profiles ?? []).map(p => p.organization_id).filter(Boolean) as string[])]
  const { data: orgs } = orgIds.length
    ? await db.from('organizations').select('id, name').in('id', orgIds)
    : { data: [] as { id: string; name: string }[] }
  const orgName = new Map((orgs ?? []).map(o => [o.id, o.name]))

  // Métadonnées auth via listUsers (paginé), indexées par id.
  const authById = new Map<string, { email?: string; created_at?: string; email_confirmed_at?: string; last_sign_in_at?: string }>()
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 })
    const users = data?.users ?? []
    if (error || users.length === 0) break
    for (const u of users) {
      authById.set(u.id, {
        email: u.email ?? undefined,
        created_at: u.created_at,
        email_confirmed_at: (u as { email_confirmed_at?: string }).email_confirmed_at,
        last_sign_in_at: (u as { last_sign_in_at?: string }).last_sign_in_at,
      })
    }
    if (users.length < 1000) break
  }

  type UserRow = {
    user_id: string
    email: string | null
    role: 'owner' | 'member'
    created_at: string | null
    email_confirmed_at: string | null
    last_sign_in_at: string | null
  }
  const groups = new Map<string, { organization_id: string | null; organization_name: string | null; users: UserRow[] }>()

  for (const p of profiles ?? []) {
    const u = authById.get(p.id)
    // N'apparaissent que les comptes dont l'email a été validé.
    if (!u?.email_confirmed_at) continue

    const key = p.organization_id ?? '__none__'
    if (!groups.has(key)) {
      groups.set(key, {
        organization_id: p.organization_id ?? null,
        organization_name: p.organization_id ? (orgName.get(p.organization_id) ?? null) : null,
        users: [],
      })
    }
    groups.get(key)!.users.push({
      user_id: p.id,
      email: u.email ?? null,
      role: p.user_type === 'integrator' ? 'owner' : 'member',
      created_at: u.created_at ?? null,
      email_confirmed_at: u.email_confirmed_at ?? null,
      last_sign_in_at: u.last_sign_in_at ?? null,
    })
  }

  // Tri : organisations par nom ; au sein d'une org, owners d'abord puis par date d'inscription décroissante.
  const organizations = [...groups.values()].sort((a, b) =>
    (a.organization_name ?? 'zzz').localeCompare(b.organization_name ?? 'zzz'),
  )
  for (const g of organizations) {
    g.users.sort((a, b) => {
      if (a.role !== b.role) return a.role === 'owner' ? -1 : 1
      return (b.created_at ?? '').localeCompare(a.created_at ?? '')
    })
  }

  return NextResponse.json({ organizations })
}
