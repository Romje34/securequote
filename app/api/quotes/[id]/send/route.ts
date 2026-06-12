import { NextResponse } from 'next/server'
import { sendQuoteEmail } from '@/lib/email'
import { requireUser, userCanAccessQuote } from '@/lib/auth'

type RouteContext = { params: Promise<{ id: string }> }

function itemTotal(it: { row_type: string; quantity: number; sell_price: number; discount: number }) {
  if (it.row_type !== 'item') return 0
  return it.quantity * it.sell_price * (1 - it.discount / 100)
}

// POST — envoie le devis par email au client avec un lien de consultation/signature
export async function POST(request: Request, ctx: RouteContext) {
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "RESEND_API_KEY manquante — l'envoi d'email n'est pas configuré" }, { status: 500 })
  }

  try {
    const auth = await requireUser()
    if (auth instanceof NextResponse) return auth
    const { user, db } = auth

    const { id } = await ctx.params
    const { allowed } = await userCanAccessQuote(db, user.id, id)
    if (!allowed) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

    const body = await request.json().catch(() => ({}))
    const overrideEmail = (body.email ?? '').toString().trim() || null

    const { data: quote, error: quoteError } = await db
      .from('quotes')
      .select('id, quote_number, title, valid_until, created_by, public_token, clients(id, name, email), companies(email)')
      .eq('id', id)
      .maybeSingle()

    if (quoteError || !quote) {
      return NextResponse.json({ error: 'Devis introuvable' }, { status: 404 })
    }

    const client = Array.isArray(quote.clients) ? quote.clients[0] : quote.clients
    const company = Array.isArray(quote.companies) ? quote.companies[0] : quote.companies
    const recipientEmail = overrideEmail ?? client?.email ?? company?.email ?? null

    if (!recipientEmail) {
      return NextResponse.json({ error: "Aucune adresse email destinataire — renseignez l'email du client ou saisissez-en un" }, { status: 400 })
    }

    // Génère le token public si absent
    let token = quote.public_token as string | null
    if (!token) {
      const { data: updated, error: tokenError } = await db
        .from('quotes')
        .update({ public_token: crypto.randomUUID() })
        .eq('id', id)
        .select('public_token')
        .single()
      if (tokenError || !updated) {
        return NextResponse.json({ error: tokenError?.message ?? 'Erreur lors de la génération du lien' }, { status: 500 })
      }
      token = updated.public_token as string
    }

    // Calcule le total HT
    const { data: chapters } = await db
      .from('quote_chapters')
      .select('id')
      .eq('quote_id', id)

    const chapterIds = (chapters ?? []).map(c => c.id as string)
    let totalHT = 0
    if (chapterIds.length > 0) {
      const { data: items } = await db
        .from('quote_items')
        .select('row_type, quantity, sell_price, discount')
        .in('chapter_id', chapterIds)
      totalHT = (items ?? []).reduce((acc, it) => acc + itemTotal(it as { row_type: string; quantity: number; sell_price: number; discount: number }), 0)
    }

    // Branding de l'auteur du devis (cohérent quel que soit l'expéditeur)
    const { data: branding } = await db
      .from('owner_branding')
      .select('trade_name')
      .eq('owner_id', quote.created_by)
      .maybeSingle()

    await sendQuoteEmail({
      to:           recipientEmail,
      reply_to:     user.email ?? null,
      quote_number: quote.quote_number,
      title:        quote.title,
      client_name:  client?.name ?? null,
      company_name: branding?.trade_name ?? 'SecureQuote',
      total_ht:     totalHT,
      valid_until:  quote.valid_until,
      token,
    })

    await db.from('quotes').update({
      status:  'sent',
      sent_at: new Date().toISOString(),
    }).eq('id', id)

    return NextResponse.json({ success: true, sent_to: recipientEmail, token })
  } catch (err: unknown) {
    console.error('[api/quotes/[id]/send POST]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur interne' }, { status: 500 })
  }
}
