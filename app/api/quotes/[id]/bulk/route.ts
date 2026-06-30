import { NextResponse } from 'next/server'
import { requireUser, userCanAccessQuote } from '@/lib/auth'

type RouteContext = { params: Promise<{ id: string }> }

// Insertion groupée d'une structure complète de devis (chapitres + lignes) en
// 2 appels DB seulement — utilisé après une génération IA pour éviter la cascade
// de ~N requêtes séquentielles côté client.
type IncomingItem = {
  designation?: string
  reference?: string
  brand?: string
  unit?: string
  quantity?: number
  category?: string // 'materiel' | 'main_oeuvre' | 'forfait'
}
type IncomingChapter = { title?: string; items?: IncomingItem[] }

export async function POST(request: Request, ctx: RouteContext) {
  try {
    const auth = await requireUser()
    if (auth instanceof NextResponse) return auth
    const { user, db } = auth

    const { id: quote_id } = await ctx.params
    const { allowed } = await userCanAccessQuote(db, user.id, quote_id)
    if (!allowed) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

    const body = await request.json()
    const incoming: IncomingChapter[] = Array.isArray(body.chapters) ? body.chapters : []
    const startPosition: number = Number.isFinite(body.start_position) ? body.start_position : 0
    if (incoming.length === 0) return NextResponse.json({ chapters: [] })

    // 1) Insertion des chapitres en un seul appel. La position sert de clé de
    //    correspondance entre l'entrée et les lignes retournées (unique dans ce lot).
    const chapterRows = incoming.map((ch, i) => ({
      quote_id,
      title: (ch.title ?? '').trim() || 'Chapitre',
      position: startPosition + i,
    }))
    const { data: createdChapters, error: chErr } = await db
      .from('quote_chapters')
      .insert(chapterRows)
      .select()
    if (chErr) return NextResponse.json({ error: chErr.message }, { status: 500 })

    const byPosition = new Map<number, { id: string; position: number; title: string }>()
    for (const c of createdChapters ?? []) byPosition.set(c.position, c)

    // 2) Insertion de toutes les lignes en un seul appel.
    const itemRows: Record<string, unknown>[] = []
    incoming.forEach((ch, i) => {
      const chapter = byPosition.get(startPosition + i)
      if (!chapter) return
      ;(ch.items ?? []).forEach((it, pos) => {
        itemRows.push({
          quote_id,
          chapter_id:  chapter.id,
          row_type:    'item',
          position:    pos,
          designation: it.designation ?? '',
          reference:   it.reference || null,
          brand:       it.brand || null,
          unit:        it.unit || 'U',
          quantity:    it.quantity ?? 1,
          is_labor:    it.category === 'main_oeuvre',
          buy_price:   0,
          sell_price:  0,
          discount:    0,
          note_text:   null,
        })
      })
    })

    let createdItems: Record<string, unknown>[] = []
    if (itemRows.length > 0) {
      const { data: items, error: itErr } = await db
        .from('quote_items')
        .insert(itemRows)
        .select()
      if (itErr) return NextResponse.json({ error: itErr.message }, { status: 500 })
      createdItems = items ?? []
    }

    // Regroupe les lignes par chapitre pour renvoyer une structure directement
    // exploitable par l'état du client.
    const itemsByChapter = new Map<string, Record<string, unknown>[]>()
    for (const it of createdItems) {
      const cid = it.chapter_id as string
      if (!itemsByChapter.has(cid)) itemsByChapter.set(cid, [])
      itemsByChapter.get(cid)!.push(it)
    }

    const chapters = incoming
      .map((_ch, i) => byPosition.get(startPosition + i))
      .filter((c): c is { id: string; position: number; title: string } => !!c)
      .map(c => ({
        id: c.id,
        position: c.position,
        title: c.title,
        items: (itemsByChapter.get(c.id) ?? []).sort(
          (a, b) => (a.position as number) - (b.position as number),
        ),
      }))

    return NextResponse.json({ chapters }, { status: 201 })
  } catch (err) {
    console.error('[bulk POST]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
