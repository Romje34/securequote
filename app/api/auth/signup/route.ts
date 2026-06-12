import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Client service-role : crée le compte, l'organisation et promeut le profil owner.
function adm() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// POST public — auto-inscription d'un owner avec sa société.
// Le compte est actif immédiatement et démarre sans forfait (essai gratuit : 5 devis IA).
export async function POST(request: Request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY manquante' }, { status: 500 })
  }

  const body = await request.json().catch(() => ({}))
  const { email, password, company_name, siret, address, postal_code, city, country, phone, company_email } = body

  if (!email || !password) {
    return NextResponse.json({ error: 'Email et mot de passe requis' }, { status: 400 })
  }
  if (!company_name?.trim()) {
    return NextResponse.json({ error: 'La raison sociale est obligatoire' }, { status: 400 })
  }

  const db = adm()

  const orgFields = {
    name:        company_name.trim(),
    siret:       siret         || null,
    address:     address       || null,
    postal_code: postal_code   || null,
    city:        city          || null,
    country:     country       || 'France',
    phone:       phone         || null,
    email:       company_email || null,
  }

  // Créer le compte auth
  const { data: created, error: createError } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (createError) {
    const alreadyExists =
      createError.message.toLowerCase().includes('already') ||
      createError.message.toLowerCase().includes('existe')
    if (alreadyExists) {
      return NextResponse.json({ error: 'Un compte existe déjà avec cet email.' }, { status: 409 })
    }
    return NextResponse.json({ error: createError.message }, { status: 400 })
  }

  const newUserId = created.user.id

  // Créer l'organisation (sans forfait → essai gratuit)
  const { data: org, error: orgError } = await db
    .from('organizations')
    .insert(orgFields)
    .select('id')
    .single()

  if (orgError) {
    await db.auth.admin.deleteUser(newUserId)
    return NextResponse.json({ error: `Erreur organisation : ${orgError.message}` }, { status: 500 })
  }

  // Promouvoir le profil en owner rattaché à son organisation
  const { error: profileError } = await db.from('profiles').update({
    user_type:       'integrator',
    organization_id: org.id,
  }).eq('id', newUserId)

  if (profileError) {
    await db.from('organizations').delete().eq('id', org.id)
    await db.auth.admin.deleteUser(newUserId)
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }

  return NextResponse.json(
    { user_id: newUserId, email, organization_name: orgFields.name },
    { status: 201 }
  )
}
