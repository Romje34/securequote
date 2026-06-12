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

// PATCH — attribue / change / retire le forfait IA d'une organisation (déblocage manuel,
// en attendant l'auto-service Stripe). plan_id = null remet l'org en essai gratuit.
export async function PATCH(request: Request) {
  const ctx = await requireSuperAdmin()
  if (!ctx) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  const { db } = ctx

  const { organization_id, plan_id } = await request.json().catch(() => ({}))
  if (!organization_id) return NextResponse.json({ error: 'organization_id requis' }, { status: 400 })

  // Valider le forfait s'il est fourni
  if (plan_id) {
    const { data: plan } = await db.from('plans').select('id').eq('id', plan_id).maybeSingle()
    if (!plan) return NextResponse.json({ error: 'Forfait introuvable' }, { status: 404 })
  }

  const { error } = await db
    .from('organizations')
    .update({ plan_id: plan_id || null })
    .eq('id', organization_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, organization_id, plan_id: plan_id || null })
}
