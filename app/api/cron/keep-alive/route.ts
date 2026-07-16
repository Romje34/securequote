import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Empêche la mise en pause du projet Supabase (plan gratuit = pause après
// 7 jours d'inactivité). Déclenché par Vercel Cron (voir vercel.json).
// Fait une requête réelle en base → compte comme activité Postgres.
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  // Vercel ajoute automatiquement l'en-tête Authorization: Bearer $CRON_SECRET
  // aux appels du cron si la variable CRON_SECRET est définie sur le projet.
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = request.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
  }

  const db = createAdminClient()
  // Requête minuscule sur une table statique : garde la base "active".
  const { error } = await db.from('plans').select('id').limit(1)

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true, ts: new Date().toISOString() })
}
