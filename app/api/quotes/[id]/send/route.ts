import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { sendQuoteEmail } from '@/lib/email'

async function getSessionClient() {
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

function itemTotal(it: { row_type: string; quantity: number; sell_price: number; discount: number }) {
  if (it.row_type !== 'item') return 0
  return it.quantity * it.sell_price * (1 - it.discount / 100)
}

// POST — envoie le devis par email au client avec un lien de consultation/signature
export async function POST(request: Request, ctx: RouteContext) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY manquante' }, { status: 500 })
  }
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "RESEND_API_KEY manquante — l'envoi d'email n'est pas configuré" }, { status: 500 })
  }

  try {
    const { id } = await ctx.params
    const supabase = await getSessionClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const overrideEmail = (body.email ?? '').toString().trim() || null

    const db = adm()

    const { data: quote, error: quoteError } = await db
      .from('quotes')
      .select('id, quote_number, title, valid_until, created_by, public_token, clients(id, name, email)')
      .eq('id', id)
      .maybeSingle()

    if (quoteError || !quote) {
      return NextResponse.json({ error: 'Devis introuvable' }, { status: 404 })
    }
    if (quote.created_by !== user.id) {
      return NextResponse.json({ error: 'non autorisé' }, { status: 403 })
    }

    const client = Array.isArray(quote.clients) ? quote.clients[0] : quote.clients
    const recipientEmail = overrideEmail ?? client?.email ?? null

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

    const { data: branding } = await db
      .from('owner_branding')
      .select('trade_name')
      .eq('owner_id', user.id)
      .maybeSingle()

    await sendQuoteEmail({
      to:           recipientEmail,
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
