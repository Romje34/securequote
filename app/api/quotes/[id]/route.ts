import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

async function getSupabase() {
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

type RouteContext = { params: Promise<{ id: string }> }

// GET — devis complet avec chapitres + lignes (requêtes séparées pour éviter la dépendance FK)
export async function GET(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })

  const db = adm()

  const { data: quote, error: qErr } = await db
    .from('quotes')
    .select('*, clients(id, name, address, postal_code, city, country, phone, email, siret), companies(id, company_name, city)')
    .eq('id', id)
    .single()

  if (qErr || !quote) return NextResponse.json({ error: qErr?.message ?? 'not found', code: qErr?.code, details: qErr?.details }, { status: 404 })

  const { data: chapters } = await db
    .from('quote_chapters')
    .select('id, position, title, description')
    .eq('quote_id', id)
    .order('position')

  const chapterIds = (chapters ?? []).map((c: Record<string, unknown>) => c.id as string)

  let items: Record<string, unknown>[] = []
  if (chapterIds.length > 0) {
    const { data: rows } = await db
      .from('quote_items')
      .select('id, chapter_id, position, row_type, designation, reference, brand, unit, quantity, buy_price, sell_price, discount, is_labor, note_text')
      .in('chapter_id', chapterIds)
      .order('position')
    items = rows ?? []
  }

  const quote_chapters = (chapters ?? []).map((ch: Record<string, unknown>) => ({
    ...ch,
    items: items.filter(it => it.chapter_id === ch.id),
  }))

  return NextResponse.json({ ...quote, quote_chapters })
}

// PUT — mise à jour de l'en-tête du devis
export async function PUT(request: Request, ctx: RouteContext) {
  const { id } = await ctx.params
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })

  const body = await request.json()
  const allowed = [
    'title', 'reference', 'site_address', 'issued_at', 'valid_until',
    'salesperson', 'notes', 'conditions', 'tva_rate', 'status',
    'client_id', 'show_references', 'show_brands', 'show_unit_prices',
    'show_quantities', 'show_chapter_totals',
  ]
  const payload: Record<string, unknown> = {}
  for (const k of allowed) if (k in body) payload[k] = body[k]

  const { data, error } = await adm()
    .from('quotes').update(payload).eq('id', id).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE
export async function DELETE(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })

  const { error } = await adm().from('quotes').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
