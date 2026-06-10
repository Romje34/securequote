import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { orgQuotePrefix } from '@/lib/quote-prefix'

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

// POST — duplique un devis (en-tête + chapitres + lignes) en un nouveau brouillon
export async function POST(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })

  const db = adm()

  const { data: original, error: origError } = await db
    .from('quotes')
    .select('*')
    .eq('id', id)
    .single()

  if (origError || !original) return NextResponse.json({ error: 'Devis introuvable' }, { status: 404 })

  // Vérifier que l'utilisateur est owner de la société du devis
  const { data: membership } = await db
    .from('company_members')
    .select('user_id')
    .eq('company_id', original.company_id)
    .eq('user_id', user.id)
    .eq('role', 'owner')
    .maybeSingle()

  if (!membership) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  // Préfixe = 3 lettres du nom de l'organisation du user ; compteur global → référence unique
  const prefix = await orgQuotePrefix(db, user.id)

  const { data: numRow } = await db.rpc('next_quote_number', { p_prefix: prefix })
  const quote_number = (numRow as string) ?? `${prefix}-${new Date().getFullYear()}-0001`

  // Créer la copie de l'en-tête (statut réinitialisé à "draft", pas de signature/envoi)
  const { data: copy, error: copyError } = await db
    .from('quotes')
    .insert({
      company_id:          original.company_id,
      client_id:           original.client_id,
      quote_number,
      status:              'draft',
      title:               original.title,
      reference:           original.reference,
      site_address:        original.site_address,
      issued_at:           new Date().toISOString().split('T')[0],
      valid_until:         null,
      salesperson:         original.salesperson,
      notes:               original.notes,
      conditions:          original.conditions,
      tva_rate:            original.tva_rate,
      show_references:     original.show_references,
      show_brands:         original.show_brands,
      show_unit_prices:    original.show_unit_prices,
      show_quantities:     original.show_quantities,
      show_chapter_totals: original.show_chapter_totals,
      created_by:          user.id,
    })
    .select('id, quote_number')
    .single()

  if (copyError || !copy) return NextResponse.json({ error: copyError?.message ?? 'Erreur duplication' }, { status: 500 })

  // Copier les chapitres
  const { data: chapters } = await db
    .from('quote_chapters')
    .select('id, position, title, description')
    .eq('quote_id', id)
    .order('position')

  for (const ch of chapters ?? []) {
    const { data: newChapter, error: chError } = await db
      .from('quote_chapters')
      .insert({ quote_id: copy.id, position: ch.position, title: ch.title, description: ch.description })
      .select('id')
      .single()

    if (chError || !newChapter) continue

    const { data: items } = await db
      .from('quote_items')
      .select('position, row_type, designation, reference, brand, unit, quantity, buy_price, sell_price, discount, is_labor, note_text')
      .eq('chapter_id', ch.id)
      .order('position')

    if (items && items.length > 0) {
      await db.from('quote_items').insert(
        items.map(it => ({ ...it, chapter_id: newChapter.id }))
      )
    }
  }

  return NextResponse.json({ id: copy.id, quote_number: copy.quote_number }, { status: 201 })
}
