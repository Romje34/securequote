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

export async function POST(request: Request, ctx: RouteContext) {
  try {
    const { id: quote_id, cid: chapter_id } = await ctx.params
    const body = await request.json()
    const row_type = body.row_type ?? 'item'

    console.log('[items POST] quote_id:', quote_id, 'chapter_id:', chapter_id, 'row_type:', row_type)

    const { data, error } = await adm().rpc('add_quote_item', {
      p_quote_id:    quote_id,
      p_chapter_id:  chapter_id,
      p_row_type:    row_type,
      p_position:    body.position    ?? 0,
      p_designation: (row_type === 'note' || row_type === 'separator') ? '' : (body.designation ?? ''),
      p_reference:   body.reference   ?? null,
      p_brand:       body.brand       ?? null,
      p_unit:        body.unit        ?? 'U',
      p_quantity:    body.quantity    ?? 1,
      p_buy_price:   body.buy_price   ?? 0,
      p_sell_price:  body.sell_price  ?? 0,
      p_discount:    body.discount    ?? 0,
      p_is_labor:    body.is_labor    ?? false,
      p_note_text:   body.note_text   ?? null,
    })

    console.log('[items POST] data:', JSON.stringify(data), 'error:', JSON.stringify(error))

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    console.error('[items POST] CRASH:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
