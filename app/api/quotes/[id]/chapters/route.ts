import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function adm() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: Request, ctx: RouteContext) {
  const { id: quote_id } = await ctx.params
  const { title, position = 0 } = await request.json()
  if (!title?.trim()) return NextResponse.json({ error: 'title requis' }, { status: 400 })

  const { data, error } = await adm()
    .from('quote_chapters')
    .insert({ quote_id, title: title.trim(), position })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
