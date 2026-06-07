import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

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

// GET — l'organisation (société) à laquelle le compte connecté est rattaché
export async function GET() {
  const supabase = await getSessionClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })

  const db = adm()
  const { data: profile } = await db
    .from('profiles')
    .select('user_type, organization_id')
    .eq('id', user.id)
    .single()

  if (!profile?.organization_id) {
    return NextResponse.json({ organization: null, can_edit: false })
  }

  const { data: org, error } = await db
    .from('organizations')
    .select('id, name, siret, address, postal_code, city, country, phone, email')
    .eq('id', profile.organization_id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    organization: org,
    can_edit: profile.user_type === 'integrator',
  })
}

// PATCH — modifie les informations de la société du owner connecté
export async function PATCH(request: Request) {
  const supabase = await getSessionClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })

  const db = adm()
  const { data: profile } = await db
    .from('profiles')
    .select('user_type, organization_id')
    .eq('id', user.id)
    .single()

  if (profile?.user_type !== 'integrator') {
    return NextResponse.json({ error: "Seul le owner peut modifier la société." }, { status: 403 })
  }
  if (!profile.organization_id) {
    return NextResponse.json({ error: "Votre compte n'est rattaché à aucune société. Contactez l'administrateur." }, { status: 409 })
  }

  const body = await request.json().catch(() => ({}))
  const name = (body.name ?? '').toString().trim()
  if (!name) {
    return NextResponse.json({ error: 'La raison sociale est obligatoire' }, { status: 400 })
  }

  const { error } = await db
    .from('organizations')
    .update({
      name,
      siret:       body.siret       || null,
      address:     body.address     || null,
      postal_code: body.postal_code || null,
      city:        body.city        || null,
      country:     body.country     || 'France',
      phone:       body.phone       || null,
      email:       body.email       || null,
    })
    .eq('id', profile.organization_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
