import { NextResponse } from 'next/server'
import { sendSignatureConfirmation } from '@/lib/email'
import { createAdminClient as adm } from '@/lib/supabase/admin'

type RouteContext = { params: Promise<{ token: string }> }

function itemTotal(it: { row_type: string; quantity: number; sell_price: number; discount: number }) {
  if (it.row_type !== 'item') return 0
  return it.quantity * it.sell_price * (1 - it.discount / 100)
}

// GET — consultation publique du devis via son token (lecture seule, sans auth)
export async function GET(_req: Request, ctx: RouteContext) {
  const { token } = await ctx.params
  const db = adm()

  const { data: quote, error } = await db
    .from('quotes')
    .select('*, clients(id, name, address, postal_code, city, country, phone, email, siret), companies(id, company_name)')
    .eq('public_token', token)
    .maybeSingle()

  if (error || !quote) {
    return NextResponse.json({ error: 'Devis introuvable ou lien invalide' }, { status: 404 })
  }

  const { data: chapters } = await db
    .from('quote_chapters')
    .select('id, position, title')
    .eq('quote_id', quote.id)
    .order('position')

  const chapterIds = (chapters ?? []).map(c => c.id as string)
  let items: Record<string, unknown>[] = []
  if (chapterIds.length > 0) {
    const { data: rows } = await db
      .from('quote_items')
      .select('id, chapter_id, position, row_type, designation, reference, brand, unit, quantity, sell_price, discount, is_labor, note_text')
      .in('chapter_id', chapterIds)
      .order('position')
    items = rows ?? []
  }

  const { data: branding } = await db
    .from('owner_branding')
    .select('trade_name, address, postal_code, city, country, phone, email, website, siret, vat_number, logo_url, primary_color, footer_text')
    .eq('owner_id', quote.created_by)
    .maybeSingle()

  const quote_chapters = (chapters ?? []).map(ch => ({
    ...ch,
    items: items.filter(it => it.chapter_id === ch.id),
  }))

  const totalHT = quote_chapters.reduce(
    (acc, ch) => acc + ch.items.reduce((a: number, it: Record<string, unknown>) => a + itemTotal(it as { row_type: string; quantity: number; sell_price: number; discount: number }), 0),
    0
  )

  return NextResponse.json({
    id:               quote.id,
    quote_number:     quote.quote_number,
    status:           quote.status,
    title:            quote.title,
    reference:        quote.reference,
    site_address:     quote.site_address,
    issued_at:        quote.issued_at,
    valid_until:      quote.valid_until,
    notes:            null, // jamais exposer les notes internes
    conditions:       quote.conditions,
    tva_rate:         quote.tva_rate,
    show_references:  quote.show_references ?? true,
    show_brands:      quote.show_brands ?? true,
    show_unit_prices: quote.show_unit_prices ?? true,
    show_quantities:  quote.show_quantities ?? true,
    signed_at:        quote.signed_at,
    signed_by:        quote.signed_by,
    total_ht:         totalHT,
    client:           quote.clients,
    branding:         branding ?? null,
    chapters:         quote_chapters,
  })
}

// POST — signature électronique du devis (lecture seule -> accepté)
export async function POST(request: Request, ctx: RouteContext) {
  const { token } = await ctx.params
  const db = adm()

  const body = await request.json().catch(() => ({}))
  const signedBy = (body.signed_by ?? '').toString().trim()

  if (!signedBy) {
    return NextResponse.json({ error: 'Le nom complet du signataire est requis' }, { status: 400 })
  }

  const { data: quote, error } = await db
    .from('quotes')
    .select('id, quote_number, title, status, signed_at, created_by, clients(email)')
    .eq('public_token', token)
    .maybeSingle()

  if (error || !quote) {
    return NextResponse.json({ error: 'Devis introuvable ou lien invalide' }, { status: 404 })
  }

  if (quote.signed_at) {
    return NextResponse.json({ error: 'Ce devis a déjà été signé', already_signed: true, signed_at: quote.signed_at }, { status: 409 })
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('x-real-ip')
    ?? null

  const signedAt = new Date().toISOString()

  const { error: updError } = await db
    .from('quotes')
    .update({
      status:       'accepted',
      signed_at:    signedAt,
      signed_by:    signedBy,
      signature_ip: ip,
    })
    .eq('id', quote.id)

  if (updError) return NextResponse.json({ error: updError.message }, { status: 500 })

  // Emails de confirmation (best-effort, ne bloque pas la réponse en cas d'échec)
  try {
    const { data: ownerAuth } = await db.auth.admin.getUserById(quote.created_by)
    const { data: branding } = await db.from('owner_branding').select('trade_name').eq('owner_id', quote.created_by).maybeSingle()
    const clientEmail = Array.isArray(quote.clients) ? quote.clients[0]?.email : (quote.clients as { email: string | null } | null)?.email

    if (ownerAuth?.user?.email && clientEmail) {
      await sendSignatureConfirmation({
        to_owner:     ownerAuth.user.email,
        to_client:    clientEmail,
        quote_number: quote.quote_number,
        title:        quote.title,
        signed_by:    signedBy,
        signed_at:    signedAt,
        company_name: branding?.trade_name ?? 'SecureQuote',
      })
    }
  } catch (e) {
    console.error('[sign] confirmation email failed:', e)
  }

  return NextResponse.json({ success: true, signed_at: signedAt, signed_by: signedBy })
}
