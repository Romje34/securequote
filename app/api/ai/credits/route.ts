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

// Premier jour du mois calendaire courant (UTC), ISO — borne de remise à zéro.
function startOfMonthISO() {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

// GET — état des crédits IA de l'organisation du compte connecté.
export async function GET() {
  const supabase = await getSessionClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })

  const db = adm()
  const { data: profile } = await db
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  if (!profile?.organization_id) {
    return NextResponse.json({ organization: null })
  }

  // Forfait de l'organisation
  const { data: org } = await db
    .from('organizations')
    .select('id, name, plan:plan_id ( id, name, monthly_credits, price )')
    .eq('id', profile.organization_id)
    .maybeSingle()

  const plan = (org?.plan ?? null) as
    | { id: string; name: string; monthly_credits: number; price: number }
    | null

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

  // Tous les forfaits disponibles (pour comparaison / changement de palier)
  const { data: plans } = await db
    .from('plans')
    .select('id, name, monthly_credits, price, sort_order')
    .order('sort_order', { ascending: true })

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
