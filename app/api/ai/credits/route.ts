import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'

// Premier jour du mois calendaire courant (UTC), ISO — borne de remise à zéro.
function startOfMonthISO() {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

// GET — état des crédits IA de l'organisation du compte connecté.
export async function GET() {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { user, db } = auth

  const { data: profile } = await db
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  if (!profile?.organization_id) {
    return NextResponse.json({ organization: null })
  }

  // Organisation + son forfait (jointure manuelle, indépendante du cache FK PostgREST).
  const { data: org } = await db
    .from('organizations')
    .select('id, name')
    .eq('id', profile.organization_id)
    .maybeSingle()

  // plan_id et plans sont optionnels tant que la migration crédits IA n'est pas appliquée.
  const { data: orgPlan } = await db
    .from('organizations')
    .select('plan_id')
    .eq('id', profile.organization_id)
    .maybeSingle()
  const planId = (orgPlan as { plan_id: string | null } | null)?.plan_id ?? null

  type PlanRow = { id: string; name: string; monthly_credits: number; price: number; sort_order?: number }
  const { data: plans } = await db
    .from('plans')
    .select('id, name, monthly_credits, price, sort_order')
    .order('sort_order', { ascending: true })

  const plan = planId
    ? ((plans ?? []).find(p => p.id === planId) as PlanRow | undefined ?? null)
    : null

  // Consommation du mois calendaire courant
  const periodStart = startOfMonthISO()
  const { data: usage } = await db
    .from('ai_usage')
    .select('credits_consumed')
    .eq('organization_id', profile.organization_id)
    .gte('created_at', periodStart)

  const consumed = (usage ?? []).reduce((sum, r) => sum + (r.credits_consumed ?? 0), 0)
  const monthlyCredits = plan?.monthly_credits ?? 0
  const remaining = Math.max(0, monthlyCredits - consumed)

  // Essai gratuit (org sans forfait) : nombre de devis IA complets déjà générés (à vie).
  const FREE_DEVIS_LIMIT = 5
  let freeDevisUsed = 0
  if (!plan) {
    const { count } = await db
      .from('ai_usage')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', profile.organization_id)
      .eq('mode', 'full')
    freeDevisUsed = count ?? 0
  }

  return NextResponse.json({
    organization: { id: org?.id, name: org?.name },
    plan,
    monthly_credits: monthlyCredits,
    consumed,
    remaining,
    period_start: periodStart,
    free_devis_used: freeDevisUsed,
    free_devis_limit: FREE_DEVIS_LIMIT,
    plans: plans ?? [],
  })
}
