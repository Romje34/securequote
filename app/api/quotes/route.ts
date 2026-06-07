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

function itemTotal(it: { row_type: string; quantity: number; sell_price: number; discount: number }) {
  if (it.row_type !== 'item') return 0
  return it.quantity * it.sell_price * (1 - it.discount / 100)
}

// GET — liste les devis des sociétés de l'owner (filtrable par ?company_id=)
export async function GET(request: Request) {
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })

  const companyFilter = new URL(request.url).searchParams.get('company_id')

  const { data: owned } = await adm()
    .from('company_members')
    .select('company_id')
    .eq('user_id', user.id)
    .eq('role', 'owner')

  let ids = (owned ?? []).map(r => r.company_id)
  if (companyFilter) ids = ids.filter(id => id === companyFilter)
  if (ids.length === 0) return NextResponse.json([])

  const db = adm()

  const { data, error } = await db
    .from('quotes')
    .select('id, quote_number, status, title, issued_at, valid_until, tva_rate, sent_at, signed_at, signed_by, public_token, company_id, client_id, clients(name), companies(company_name)')
    .in('company_id', ids)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const quotes = data ?? []
  if (quotes.length === 0) return NextResponse.json([])

  // Calcule le total HT de chaque devis en une seule passe
  const quoteIds = quotes.map(q => q.id)
  const { data: chapters } = await db
    .from('quote_chapters')
    .select('id, quote_id')
    .in('quote_id', quoteIds)

  const chapterToQuote: Record<string, string> = {}
  for (const ch of chapters ?? []) chapterToQuote[ch.id as string] = ch.quote_id as string

  const chapterIds = Object.keys(chapterToQuote)
  const totalsByQuote: Record<string, number> = {}
  if (chapterIds.length > 0) {
    const { data: items } = await db
      .from('quote_items')
      .select('chapter_id, row_type, quantity, sell_price, discount')
      .in('chapter_id', chapterIds)

    for (const it of items ?? []) {
      const qId = chapterToQuote[it.chapter_id as string]
      if (!qId) continue
      totalsByQuote[qId] = (totalsByQuote[qId] ?? 0) + itemTotal(it as { row_type: string; quantity: number; sell_price: number; discount: number })
    }
  }

  const result = quotes.map(q => ({ ...q, total_ht: totalsByQuote[q.id] ?? 0 }))
  return NextResponse.json(result)
}

// POST — crée un devis avec ses chapitres initiaux
export async function POST(request: Request) {
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })

  const body = await request.json()
  const {
    company_id, client_id, client_name,
    title, reference, site_address,
    issued_at, valid_until, salesperson,
    tva_rate = 20,
    trades = [],        // chapitres à pré-créer : string[]
  } = body

  if (!company_id) return NextResponse.json({ error: 'company_id requis' }, { status: 400 })

  const db = adm()

  // Récupérer le préfixe du branding de l'owner
  const { data: branding } = await db
    .from('owner_branding')
    .select('quote_prefix, default_tva_rate, default_validity_days, default_conditions')
    .eq('owner_id', user.id)
    .maybeSingle()

  const prefix = branding?.quote_prefix ?? 'DEV'

  // Générer le numéro de devis
  const { data: numRow } = await db.rpc('next_quote_number', {
    p_company_id: company_id,
    p_prefix: prefix,
  })
  const quote_number = (numRow as string) ?? `${prefix}-${new Date().getFullYear()}-0001`

  // Créer un client inline si besoin
  let finalClientId = client_id ?? null
  if (!finalClientId && client_name?.trim()) {
    const { data: newClient } = await db
      .from('clients')
      .insert({ company_id, name: client_name.trim() })
      .select('id')
      .single()
    finalClientId = newClient?.id ?? null
  }

  // Calculer valid_until si non fourni
  let finalValidUntil = valid_until
  if (!finalValidUntil && issued_at) {
    const d = new Date(issued_at)
    d.setDate(d.getDate() + (branding?.default_validity_days ?? 30))
    finalValidUntil = d.toISOString().split('T')[0]
  }

  // Créer le devis
  const { data: quote, error: qErr } = await db
    .from('quotes')
    .insert({
      company_id,
      client_id: finalClientId,
      quote_number,
      title: title?.trim() || null,
      reference: reference?.trim() || null,
      site_address: site_address?.trim() || null,
      issued_at: issued_at ?? new Date().toISOString().split('T')[0],
      valid_until: finalValidUntil ?? null,
      salesperson: salesperson?.trim() || null,
      tva_rate: tva_rate ?? branding?.default_tva_rate ?? 20,
      conditions: branding?.default_conditions ?? null,
      created_by: user.id,
    })
    .select()
    .single()

  if (qErr || !quote) return NextResponse.json({ error: qErr?.message ?? 'Erreur création devis' }, { status: 500 })

  // Pré-créer les chapitres sélectionnés
  if (trades.length > 0) {
    await db.from('quote_chapters').insert(
      (trades as string[]).map((trade, i) => ({
        quote_id: quote.id,
        position: i,
        title: trade,
      }))
    )
  }

  return NextResponse.json({ id: quote.id, quote_number: quote.quote_number }, { status: 201 })
}
