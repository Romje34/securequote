import { NextResponse } from 'next/server'
import { requireUser, userCanAccessQuote } from '@/lib/auth'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: Request, ctx: RouteContext) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { user, db } = auth

  const { id: quote_id } = await ctx.params
  const { allowed } = await userCanAccessQuote(db, user.id, quote_id)
  if (!allowed) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  const { title, position = 0 } = await request.json()
  if (!title?.trim()) return NextResponse.json({ error: 'title requis' }, { status: 400 })

  const { data, error } = await db
    .from('quote_chapters')
    .insert({ quote_id, title: title.trim(), position })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
