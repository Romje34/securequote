import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function adm() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

type RouteContext = { params: Promise<{ id: string; iid: string }> }

export async function PUT(request: Request, ctx: RouteContext) {
  const { iid } = await ctx.params
  const body = await request.json()

  const { data, error } = await adm().rpc('update_quote_item', {
    p_id:          iid,
    p_designation: body.designation  ?? null,
    p_reference:   body.reference    ?? null,
    p_brand:       body.brand        ?? null,
    p_unit:        body.unit         ?? null,
    p_quantity:    body.quantity     ?? null,
    p_buy_price:   body.buy_price    ?? null,
    p_sell_price:  body.sell_price   ?? null,
    p_discount:    body.discount     ?? null,
    p_is_labor:    body.is_labor     ?? null,
    p_position:    body.position     ?? null,
    p_row_type:    body.row_type     ?? null,
    p_note_text:   body.note_text    ?? null,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: Request, ctx: RouteContext) {
  const { iid } = await ctx.params
  const { error } = await adm().from('quote_items').delete().eq('id', iid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
