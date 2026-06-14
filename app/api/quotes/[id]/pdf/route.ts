import { NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createElement } from 'react'
import { QuotePDF } from '@/lib/pdf/QuotePDF'
import type { PDFQuote, PDFBranding } from '@/lib/pdf/QuotePDF'
import { requireUser, userCanAccessQuote } from '@/lib/auth'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: Request, ctx: RouteContext) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { user, db } = auth

  const { id } = await ctx.params
  const { allowed } = await userCanAccessQuote(db, user.id, id)
  if (!allowed) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  // Charger le devis + chapitres + items (requêtes séparées)
  const { data: quote, error: qErr } = await db
    .from('quotes')
    .select('*, clients(id, name, address, postal_code, city, country, phone, email, siret)')
    .eq('id', id)
    .single()

  if (qErr || !quote) {
    return NextResponse.json({ error: 'Devis introuvable' }, { status: 404 })
  }

  const { data: rawChapters } = await db
    .from('quote_chapters')
    .select('id, position, title')
    .eq('quote_id', id)
    .order('position')

  const chapterIds = (rawChapters ?? []).map((c: Record<string, unknown>) => c.id as string)
  let rawItems: Record<string, unknown>[] = []
  if (chapterIds.length > 0) {
    const { data: rows } = await db
      .from('quote_items')
      .select('id, chapter_id, position, row_type, designation, reference, brand, unit, quantity, buy_price, sell_price, discount, is_labor, note_text')
      .in('chapter_id', chapterIds)
      .order('position')
    rawItems = rows ?? []
  }

  // Branding de l'auteur du devis (et non du lecteur, qui peut être l'owner via rollup)
  const { data: branding } = await db
    .from('owner_branding')
    .select('*')
    .eq('owner_id', quote.created_by)
    .maybeSingle()

  const chapters = (rawChapters ?? []).map((ch: Record<string, unknown>) => ({
    id:    ch.id as string,
    title: ch.title as string,
    items: rawItems
      .filter(it => it.chapter_id === ch.id)
      .map(it => ({
        id:          it.id          as string,
        row_type:    (it.row_type   as string) ?? 'item',
        note_text:   it.note_text   as string | null,
        designation: it.designation as string,
        reference:   it.reference   as string | null,
        brand:       it.brand       as string | null,
        unit:        (it.unit       as string) ?? 'U',
        quantity:    Number(it.quantity)   ?? 1,
        sell_price:  Number(it.sell_price) ?? 0,
        discount:    Number(it.discount)   ?? 0,
        is_labor:    Boolean(it.is_labor),
      })),
  }))

  const pdfQuote: PDFQuote = {
    quote_number:       quote.quote_number,
    status:             quote.status,
    title:              quote.title,
    reference:          quote.reference,
    site_address:       quote.site_address,
    issued_at:          quote.issued_at,
    valid_until:        quote.valid_until,
    salesperson:        quote.salesperson,
    notes:              quote.notes,
    conditions:         quote.conditions,
    tva_rate:           Number(quote.tva_rate) ?? 20,
    show_references:    quote.show_references ?? true,
    show_brands:        quote.show_brands ?? true,
    show_unit_prices:   quote.show_unit_prices ?? true,
    show_quantities:    quote.show_quantities ?? true,
    show_chapter_totals: quote.show_chapter_totals ?? true,
    client: quote.clients ? {
      name:        (quote.clients as Record<string, unknown>).name        as string,
      address:     (quote.clients as Record<string, unknown>).address     as string | null,
      postal_code: (quote.clients as Record<string, unknown>).postal_code as string | null,
      city:        (quote.clients as Record<string, unknown>).city        as string | null,
      country:     (quote.clients as Record<string, unknown>).country     as string | null,
      phone:       (quote.clients as Record<string, unknown>).phone       as string | null,
      email:       (quote.clients as Record<string, unknown>).email       as string | null,
      siret:       (quote.clients as Record<string, unknown>).siret       as string | null,
    } : null,
    chapters,
  }

  const pdfBranding: PDFBranding = {
    trade_name:         branding?.trade_name        ?? null,
    address:            branding?.address           ?? null,
    postal_code:        branding?.postal_code       ?? null,
    city:               branding?.city              ?? null,
    phone:              branding?.phone             ?? null,
    email:              branding?.email             ?? null,
    website:            branding?.website           ?? null,
    siret:              branding?.siret             ?? null,
    vat_number:         branding?.vat_number        ?? null,
    logo_url:           branding?.logo_url          ?? null,
    signature_url:      branding?.signature_url     ?? null,
    primary_color:      branding?.primary_color     ?? '#1a1a2e',
    footer_text:        branding?.footer_text       ?? null,
    default_conditions: branding?.default_conditions ?? null,
  }

  let buffer: Buffer
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const element = createElement(QuotePDF as any, { quote: pdfQuote, branding: pdfBranding })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    buffer = await renderToBuffer(element as any)
  } catch (err) {
    console.error('[PDF] renderToBuffer failed:', err)
    return NextResponse.json({ error: 'PDF generation failed', detail: String(err) }, { status: 500 })
  }

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${quote.quote_number}.pdf"`,
    },
  })
}
