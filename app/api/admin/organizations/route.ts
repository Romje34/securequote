import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

function startOfMonthISO() {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

const FREE_DEVIS_LIMIT = 5

type Plan = { id: string; name: string; monthly_credits: number; price: number }
type Member = { id: string; email: string; role: 'owner' | 'member'; created_at: string; consumed_credits: number }
type OwnerNode = Member & { members: Member[] }

type Db = ReturnType<typeof createAdminClient>

// GET — organisations actives, regroupées : org → owners, et sous chaque owner les membres
// qu'il a invités. Tolère l'absence des objets crédits IA (plans / plan_id / ai_usage) tant
// que la migration n'est pas appliquée : forfait null et consommation 0, sans planter la liste.
export async function GET() {
  const ctx = await requireSuperAdmin()
  if (ctx instanceof NextResponse) return ctx
  const { db } = ctx

  // Données toujours présentes : organisations + profils.
  const [orgsRes, profilesRes] = await Promise.all([
    db.from('organizations').select('id, name, city, created_at').order('created_at', { ascending: false }),
    db.from('profiles')
      .select('id, email, user_type, created_at, organization_id, invited_by')
      .in('user_type', ['integrator', 'client']),
  ])

  if (orgsRes.error)     return NextResponse.json({ error: orgsRes.error.message }, { status: 500 })
  if (profilesRes.error) return NextResponse.json({ error: profilesRes.error.message }, { status: 500 })

  const orgs     = orgsRes.data ?? []
  const profiles = profilesRes.data ?? []

  // Données optionnelles (système de crédits IA) — best-effort, ignorées si non migrées.
  const planById      = await loadPlans(db)
  const planIdByOrg   = await loadOrgPlanIds(db)
  const consumedByUser = await loadConsumption(db)
  const fullCountByOrg = await loadFreeDevis(db)

  const plansList = Object.values(planById).sort((a, b) => a.price - b.price)

  const toMember = (p: typeof profiles[number]): Member => ({
    id:               p.id,
    email:            p.email,
    role:             p.user_type === 'integrator' ? 'owner' : 'member',
    created_at:       p.created_at,
    consumed_credits: consumedByUser[p.id] ?? 0,
  })

  const byDate = (a: { created_at: string }, b: { created_at: string }) => a.created_at.localeCompare(b.created_at)

  const organizations = orgs.map(o => {
    const orgProfiles = profiles.filter(p => p.organization_id === o.id)
    const ownerProfiles = orgProfiles.filter(p => p.user_type === 'integrator').sort(byDate)
    const memberProfiles = orgProfiles.filter(p => p.user_type === 'client')
    const ownerIds = new Set(ownerProfiles.map(p => p.id))

    const owners: OwnerNode[] = ownerProfiles.map(op => ({
      ...toMember(op),
      members: memberProfiles
        .filter(mp => mp.invited_by === op.id)
        .sort(byDate)
        .map(toMember),
    }))

    // Membres rattachés à l'org mais à aucun owner courant (inviteur supprimé / promu, etc.).
    const unassigned = memberProfiles
      .filter(mp => !mp.invited_by || !ownerIds.has(mp.invited_by))
      .sort(byDate)
      .map(toMember)

    const planId = planIdByOrg[o.id] ?? null
    return {
      id:                 o.id,
      name:               o.name,
      city:               o.city,
      plan:               planId ? (planById[planId] ?? null) : null,
      plan_id:            planId,
      free_devis_used:    fullCountByOrg[o.id] ?? 0,
      free_devis_limit:   FREE_DEVIS_LIMIT,
      owners,
      unassigned_members: unassigned,
    }
  })

  // Profils sans organisation (legacy).
  const orphan_members = profiles
    .filter(p => !p.organization_id)
    .sort(byDate)
    .map(toMember)

  return NextResponse.json({ organizations, orphan_members, plans: plansList })
}

// ── Chargements optionnels (tolérants à l'absence des tables/colonnes) ──────────

async function loadPlans(db: Db): Promise<Record<string, Plan>> {
  const { data, error } = await db.from('plans').select('id, name, monthly_credits, price')
  if (error || !data) return {}
  return Object.fromEntries(data.map(p => [p.id, p as Plan]))
}

async function loadOrgPlanIds(db: Db): Promise<Record<string, string | null>> {
  const { data, error } = await db.from('organizations').select('id, plan_id')
  if (error || !data) return {}
  return Object.fromEntries(data.map(o => [o.id, (o as { id: string; plan_id: string | null }).plan_id ?? null]))
}

async function loadConsumption(db: Db): Promise<Record<string, number>> {
  const { data, error } = await db
    .from('ai_usage')
    .select('user_id, credits_consumed')
    .gte('created_at', startOfMonthISO())
  if (error || !data) return {}
  const map: Record<string, number> = {}
  for (const u of data) {
    if (u.user_id) map[u.user_id] = (map[u.user_id] ?? 0) + (u.credits_consumed ?? 0)
  }
  return map
}

async function loadFreeDevis(db: Db): Promise<Record<string, number>> {
  const { data, error } = await db.from('ai_usage').select('organization_id').eq('mode', 'full')
  if (error || !data) return {}
  const map: Record<string, number> = {}
  for (const u of data) {
    if (u.organization_id) map[u.organization_id] = (map[u.organization_id] ?? 0) + 1
  }
  return map
}
