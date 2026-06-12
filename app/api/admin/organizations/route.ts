import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

async function getSessionClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(c) { c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
      },
    }
  )
}

function adm() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function requireSuperAdmin() {
  const supabase = await getSessionClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const db = adm()
  const { data: profile } = await db.from('profiles').select('user_type').eq('id', user.id).single()
  if (profile?.user_type !== 'superadmin') return null
  return { user, db }
}

// Premier jour du mois calendaire courant (UTC) — borne de remise à zéro de la conso.
function startOfMonthISO() {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

const FREE_DEVIS_LIMIT = 5

type Plan = { id: string; name: string; monthly_credits: number; price: number }

// GET — toutes les organisations actives, regroupées avec leurs comptes (owners puis membres),
// le forfait de l'org et la consommation IA (mois courant) par compte.
export async function GET() {
  const ctx = await requireSuperAdmin()
  if (!ctx) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  const { db } = ctx

  const periodStart = startOfMonthISO()

  const [orgsRes, profilesRes, plansRes] = await Promise.all([
    db.from('organizations')
      .select('id, name, city, plan_id, plan:plan_id ( id, name, monthly_credits, price )')
      .order('created_at', { ascending: false }),
    db.from('profiles')
      .select('id, email, user_type, created_at, organization_id')
      .in('user_type', ['integrator', 'client']),
    db.from('plans')
      .select('id, name, monthly_credits, price, sort_order')
      .order('sort_order', { ascending: true }),
  ])

  const orgs     = orgsRes.data ?? []
  const profiles = profilesRes.data ?? []
  const plans    = (plansRes.data ?? []) as (Plan & { sort_order: number })[]

  // Consommation IA du mois courant, par utilisateur + nombre de générations complètes par org.
  const { data: usage } = await db
    .from('ai_usage')
    .select('organization_id, user_id, mode, credits_consumed, created_at')
    .gte('created_at', periodStart)

  const consumedByUser: Record<string, number> = {}
  for (const u of usage ?? []) {
    if (u.user_id) consumedByUser[u.user_id] = (consumedByUser[u.user_id] ?? 0) + (u.credits_consumed ?? 0)
  }

  // Générations complètes (essai gratuit) — compteur à vie, indépendant du mois.
  const { data: fullUsage } = await db
    .from('ai_usage')
    .select('organization_id')
    .eq('mode', 'full')

  const fullCountByOrg: Record<string, number> = {}
  for (const u of fullUsage ?? []) {
    if (u.organization_id) fullCountByOrg[u.organization_id] = (fullCountByOrg[u.organization_id] ?? 0) + 1
  }

  // Regroupement des profils par organisation.
  type Member = { id: string; email: string; role: 'owner' | 'member'; created_at: string; consumed_credits: number }
  const membersByOrg: Record<string, Member[]> = {}
  const orphanMembers: Member[] = []

  for (const p of profiles) {
    const m: Member = {
      id:               p.id,
      email:            p.email,
      role:             p.user_type === 'integrator' ? 'owner' : 'member',
      created_at:       p.created_at,
      consumed_credits: consumedByUser[p.id] ?? 0,
    }
    if (p.organization_id) {
      ;(membersByOrg[p.organization_id] ??= []).push(m)
    } else {
      orphanMembers.push(m)
    }
  }

  // Owners d'abord, puis membres, chacun par date de création.
  const sortMembers = (a: Member, b: Member) =>
    a.role !== b.role ? (a.role === 'owner' ? -1 : 1) : a.created_at.localeCompare(b.created_at)

  const organizations = orgs.map(o => {
    const plan = (o.plan ?? null) as unknown as Plan | null
    const members = (membersByOrg[o.id] ?? []).sort(sortMembers)
    return {
      id:               o.id,
      name:             o.name,
      city:             o.city,
      plan,
      plan_id:          o.plan_id ?? null,
      free_devis_used:  fullCountByOrg[o.id] ?? 0,
      free_devis_limit: FREE_DEVIS_LIMIT,
      members,
    }
  })

  return NextResponse.json({
    organizations,
    orphan_members: orphanMembers.sort(sortMembers),
    plans,
  })
}
