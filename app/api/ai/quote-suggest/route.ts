import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `Tu es un expert en chiffrage pour intégrateurs de sûreté et sécurité électronique en France.
Tu maîtrises parfaitement les métiers : vidéosurveillance, contrôle d'accès, détection intrusion, réseau informatique, interphonie, supervision, cybersécurité, maintenance préventive et corrective.
Tu génères des structures de devis professionnelles, précises et réalistes avec une nomenclature technique française.
Tu proposes des quantités indicatives cohérentes avec le projet décrit. Tu n'inventes pas de prix : ils seront renseignés par l'intégrateur.
Pour les marques, privilégie : Hikvision, Dahua, Hanwha Vision, Uniview, Axis, Bosch, Genetec, Milestone, 2N, Paxton, Aiphone.`

// Schéma d'une ligne suggérée par l'IA (pas de prix : renseignés ensuite).
const ITEM_SCHEMA = {
  type: 'object',
  properties: {
    designation: { type: 'string', description: 'Désignation technique complète et professionnelle' },
    reference:   { type: 'string', description: 'Référence produit si pertinente, sinon chaîne vide' },
    brand:       { type: 'string', description: 'Marque si pertinente, sinon chaîne vide' },
    unit:        { type: 'string', description: 'Unité : U, Ens, M, M², H, J ou Forfait' },
    quantity:    { type: 'number', description: 'Quantité indicative' },
    category:    { type: 'string', enum: ['materiel', 'main_oeuvre', 'forfait'] },
  },
  required: ['designation', 'reference', 'brand', 'unit', 'quantity', 'category'],
  additionalProperties: false,
}

const FULL_SCHEMA = {
  type: 'object',
  properties: {
    quote_object: { type: 'string', description: "Texte professionnel pour l'objet du devis" },
    chapters: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Titre du chapitre (métier ou lot)' },
          items: { type: 'array', items: ITEM_SCHEMA },
        },
        required: ['title', 'items'],
        additionalProperties: false,
      },
    },
  },
  required: ['quote_object', 'chapters'],
  additionalProperties: false,
}

const CHAPTER_SCHEMA = {
  type: 'object',
  properties: {
    items: { type: 'array', items: ITEM_SCHEMA },
  },
  required: ['items'],
  additionalProperties: false,
}

async function getSupabase() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )
}

export async function POST(request: Request) {
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY non configurée' }, { status: 503 })
  }

  const body = await request.json().catch(() => ({}))
  const mode: string = body.mode ?? 'full'

  let userPrompt: string
  let schema: Record<string, unknown>

  if (mode === 'chapter') {
    const chapterTitle: string = (body.chapter_title ?? '').trim()
    if (!chapterTitle) {
      return NextResponse.json({ error: 'chapter_title requis' }, { status: 400 })
    }
    const context: string = (body.project_context ?? '').trim()
    const existing: string[] = Array.isArray(body.existing_items) ? body.existing_items : []
    userPrompt = `Génère les lignes de devis pour le chapitre « ${chapterTitle} ».`
      + (context ? `\nContexte du projet : ${context}` : '')
      + (existing.length ? `\nLignes déjà présentes (ne pas dupliquer) :\n- ${existing.join('\n- ')}` : '')
      + `\nPropose des lignes complémentaires, réalistes et complètes (matériel + main d'œuvre si pertinent).`
    schema = CHAPTER_SCHEMA
  } else {
    const description: string = (body.description ?? '').trim()
    if (!description) {
      return NextResponse.json({ error: 'description requise' }, { status: 400 })
    }
    userPrompt = `Génère une structure complète de devis pour ce projet :\n« ${description} »\n`
      + `Organise en chapitres par métier/lot, avec pour chaque chapitre des lignes détaillées (matériel et main d'œuvre).`
    schema = FULL_SCHEMA
  }

  try {
    const message = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      output_config: { format: { type: 'json_schema', schema } },
      messages: [{ role: 'user', content: userPrompt }],
    })

    const text = message.content.find(b => b.type === 'text')?.text ?? ''
    const parsed = JSON.parse(text)
    return NextResponse.json(parsed)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur IA'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
