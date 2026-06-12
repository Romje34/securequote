import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requireUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

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

// Client service-role pour écrire le registre d'usage (RLS : insert réservé au backend).
const adm = createAdminClient

// Essai gratuit : nombre de générations complètes offertes à une org sans forfait.
const FREE_DEVIS_LIMIT = 5

// Premier jour du mois calendaire courant (UTC) — borne de remise à zéro de la conso.
function startOfMonthISO() {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

// Contrôle de quota IA avant génération.
// Renvoie une réponse 402 (avec la liste des forfaits) si l'essai gratuit est épuisé
// ou si le forfait n'a plus de crédits ce mois-ci ; sinon null (génération autorisée).
async function quotaBlock(userId: string): Promise<NextResponse | null> {
  const db = adm()
  const { data: profile } = await db
    .from('profiles')
    .select('organization_id')
    .eq('id', userId)
    .single()

  const orgId = profile?.organization_id
  if (!orgId) return null // pas d'org → pas de quota (compte legacy)

  // plan_id de l'org (colonne optionnelle tant que la migration crédits IA n'est pas appliquée).
  const { data: org } = await db
    .from('organizations')
    .select('plan_id')
    .eq('id', orgId)
    .maybeSingle()
  const planId = (org as { plan_id: string | null } | null)?.plan_id ?? null

  const fetchPlans = async () =>
    (await db.from('plans').select('id, name, monthly_credits, price, sort_order').order('sort_order', { ascending: true })).data ?? []

  if (!planId) {
    // Essai gratuit : compter les générations complètes (à vie).
    const { count } = await db
      .from('ai_usage')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('mode', 'full')
    if ((count ?? 0) >= FREE_DEVIS_LIMIT) {
      return NextResponse.json(
        { error: 'Essai gratuit épuisé', error_code: 'trial_exhausted', plans: await fetchPlans() },
        { status: 402 }
      )
    }
    return null
  }

  // Forfait : vérifier la consommation du mois courant.
  const { data: planRow } = await db
    .from('plans')
    .select('monthly_credits')
    .eq('id', planId)
    .maybeSingle()
  const monthly = (planRow as { monthly_credits: number } | null)?.monthly_credits ?? 0
  const { data: usage } = await db
    .from('ai_usage')
    .select('credits_consumed')
    .eq('organization_id', orgId)
    .gte('created_at', startOfMonthISO())
  const consumed = (usage ?? []).reduce((s, r) => s + (r.credits_consumed ?? 0), 0)
  if (consumed >= monthly) {
    return NextResponse.json(
      { error: 'Crédits IA épuisés', error_code: 'insufficient_credits', plans: await fetchPlans() },
      { status: 402 }
    )
  }
  return null
}

// Enregistre la consommation IA (best-effort : n'échoue jamais la requête).
// 1 crédit = 1 000 tokens (entrée + sortie), arrondi au crédit supérieur.
async function recordUsage(opts: {
  userId: string
  mode: string
  quoteId: string | null
  inputTokens: number
  outputTokens: number
}) {
  try {
    const db = adm()
    const { data: profile } = await db
      .from('profiles')
      .select('organization_id')
      .eq('id', opts.userId)
      .single()
    if (!profile?.organization_id) return

    const total = opts.inputTokens + opts.outputTokens
    const credits = Math.ceil(total / 1000)

    await db.from('ai_usage').insert({
      organization_id: profile.organization_id,
      user_id: opts.userId,
      quote_id: opts.quoteId,
      mode: opts.mode === 'chapter' ? 'chapter' : 'full',
      input_tokens: opts.inputTokens,
      output_tokens: opts.outputTokens,
      credits_consumed: credits,
    })
  } catch {
    // Le registre d'usage ne doit pas bloquer la génération.
  }
}

export async function POST(request: Request) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { user } = auth

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY non configurée' }, { status: 503 })
  }

  const body = await request.json().catch(() => ({}))
  const mode: string = body.mode ?? 'full'

  // Quota : essai gratuit (5 devis) ou crédits du forfait. Bloque avant de consommer l'API.
  const blocked = await quotaBlock(user.id)
  if (blocked) return blocked

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

    await recordUsage({
      userId: user.id,
      mode,
      quoteId: typeof body.quote_id === 'string' ? body.quote_id : null,
      inputTokens: message.usage?.input_tokens ?? 0,
      outputTokens: message.usage?.output_tokens ?? 0,
    })

    return NextResponse.json(parsed)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur IA'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
