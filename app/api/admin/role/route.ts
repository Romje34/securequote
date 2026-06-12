import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth'

// PATCH — bascule un compte owner ↔ membre. Le user_type pilote le dashboard et les droits.
//   role: 'owner'  → user_type = 'integrator' (supervise toute l'organisation)
//   role: 'member' → user_type = 'client'     (dashboard membre simple)
export async function PATCH(request: Request) {
  const ctx = await requireSuperAdmin()
  if (ctx instanceof NextResponse) return ctx
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
