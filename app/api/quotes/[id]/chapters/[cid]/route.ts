import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function adm() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

type RouteContext = { params: Promise<{ id: string; cid: string }> }

export async function PUT(request: Request, ctx: RouteContext) {
  const { cid } = await ctx.params
  const body = await request.json()
  const payload: Record<string, unknown> = {}
  if ('title'       in body) payload.title       = body.title
  if ('description' in body) payload.description = body.description
  if ('position'    in body) payload.position    = body.position

  const { data, error } = await adm()
    .from('quote_chapters').update(payload).eq('id', cid).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: Request, ctx: RouteContext) {
  const { cid } = await ctx.params
  const { error } = await adm().from('quote_chapters').delete().eq('id', cid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
