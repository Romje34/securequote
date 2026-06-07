import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `Tu es un expert en chiffrage pour intégrateurs de sûreté et sécurité électronique en France.
Tu maîtrises parfaitement les métiers : vidéosurveillance, contrôle d'accès, détection intrusion, réseau informatique, interphonie, supervision, cybersécurité, maintenance préventive et corrective.
Tu génères des structures de devis professionnelles, précises et réalistes avec une nomenclature technique française.
Tu retournes UNIQUEMENT du JSON valide, sans markdown, sans commentaires.`

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

  const { description, mode = 'full' } = await request.json()
  if (!description?.trim()) {
    return NextResponse.json({ error: 'description requise' }, { status: 400 })
  }

  const userPrompt = mode === 'full'
    ? `Génère une structure complète de devis pour ce projet : "${description}"

Retourne un JSON avec ce schéma exact :
{
  "chapters": [
    {
      "title": "Titre du chapitre",
      "items": [
        {
          "designation": "Désignation complète et professionnelle",
          "reference": "REF-EXEMPLE (optionnel)",
          "brand": "Marque (ex: Hikvision, Dahua, Hanwha, Axis, Bosch, Genetec, 2N)",
          "unit": "U / Ens / H / J / M / M²",
          "quantity": 1,
          "category": "matériel | main_oeuvre | forfait"
        }
      ]
    }
  ],
  "quote_object": "Texte professionnel de l'objet du devis"
}`
    : `Pour le chapitre "${description}", génère des lignes de devis professionnelles.

Retourne un JSON avec ce schéma exact :
{
  "items": [
    {
      "designation": "Désignation complète",
      "reference": "optionnel",
      "brand": "Marque si applicable",
      "unit": "U / Ens / H / J",
      "quantity": 1,
      "category": "matériel | main_oeuvre | forfait"
    }
  ]
}`

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    const parsed = JSON.parse(text)
    return NextResponse.json(parsed)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur IA'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
