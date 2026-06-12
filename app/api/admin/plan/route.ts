import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth'

// PATCH — attribue / change / retire le forfait IA d'une organisation (déblocage manuel,
// en attendant l'auto-service Stripe). plan_id = null remet l'org en essai gratuit.
export async function PATCH(request: Request) {
  const ctx = await requireSuperAdmin()
  if (ctx instanceof NextResponse) return ctx
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
