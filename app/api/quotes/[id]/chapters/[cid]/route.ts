import { NextResponse } from 'next/server'
import { requireUser, userCanAccessChapter } from '@/lib/auth'

type RouteContext = { params: Promise<{ id: string; cid: string }> }

export async function PUT(request: Request, ctx: RouteContext) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { user, db } = auth

  const { cid } = await ctx.params
  if (!(await userCanAccessChapter(db, user.id, cid))) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  const body = await request.json()
  const payload: Record<string, unknown> = {}
  if ('title'       in body) payload.title       = body.title
  if ('description' in body) payload.description = body.description
  if ('position'    in body) payload.position    = body.position

  const { data, error } = await db
    .from('quote_chapters').update(payload).eq('id', cid).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: Request, ctx: RouteContext) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { user, db } = auth

  const { cid } = await ctx.params
  if (!(await userCanAccessChapter(db, user.id, cid))) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  const { error } = await db.from('quote_chapters').delete().eq('id', cid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
