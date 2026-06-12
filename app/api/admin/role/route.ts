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

// PATCH — bascule un compte owner ↔ membre. Le user_type pilote le dashboard et les droits.
//   role: 'owner'  → user_type = 'integrator' (supervise toute l'organisation)
//   role: 'member' → user_type = 'client'     (dashboard membre simple)
export async function PATCH(request: Request) {
  const ctx = await requireSuperAdmin()
  if (!ctx) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  const { db } = ctx

  const { user_id, role } = await request.json().catch(() => ({}))
  if (!user_id) return NextResponse.json({ error: 'user_id requis' }, { status: 400 })
  if (role !== 'owner' && role !== 'member') {
    return NextResponse.json({ error: "role doit valoir 'owner' ou 'member'" }, { status: 400 })
  }

  const { data: target } = await db
    .from('profiles')
    .select('id, user_type, organization_id')
    .eq('id', user_id)
    .single()

  if (!target) return NextResponse.json({ error: 'Compte introuvable' }, { status: 404 })
  if (target.user_type === 'superadmin') {
    return NextResponse.json({ error: "Impossible de modifier un super-administrateur" }, { status: 400 })
  }

  const newType = role === 'owner' ? 'integrator' : 'client'
  const { error } = await db.from('profiles').update({ user_type: newType }).eq('id', user_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, user_id, role })
}
