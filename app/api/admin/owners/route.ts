import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth'

// GET — liste tous les owners avec leur organisation et leurs stats
export async function GET() {
  const ctx = await requireSuperAdmin()
  if (ctx instanceof NextResponse) return ctx
  const { db } = ctx

  const { data: owners, error } = await db
    .from('profiles')
    .select('id, email, created_at, organization_id')
    .eq('user_type', 'integrator')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!owners || owners.length === 0) return NextResponse.json([])

  const ownerIds  = owners.map(o => o.id)
  const orgIds    = [...new Set(owners.map(o => o.organization_id).filter(Boolean))] as string[]

  // Stats parallèles
  const { data: allMemberships } = await db
    .from('company_members')
    .select('user_id, company_id')
    .in('user_id', ownerIds)
    .eq('role', 'owner')

  const [orgsRes, membersRes] = await Promise.all([
    orgIds.length > 0
      ? db.from('organizations').select('id, name, siret, address, postal_code, city, country, phone, email').in('id', orgIds)
      : Promise.resolve({ data: [] }),
    db.from('profiles').select('invited_by').in('invited_by', ownerIds),
  ])

  // Maps
  type OrgDetails = { name: string; siret: string | null; address: string | null; postal_code: string | null; city: string | null; country: string | null; phone: string | null; email: string | null }
  const orgMap: Record<string, OrgDetails> =
    Object.fromEntries((orgsRes.data ?? []).map(o => [o.id, o as OrgDetails]))

  const companyCounts: Record<string, number> = {}
  for (const row of allMemberships ?? []) {
    companyCounts[row.user_id] = (companyCounts[row.user_id] ?? 0) + 1
  }

  const memberCounts: Record<string, number> = {}
  for (const row of membersRes.data ?? []) {
    if (row.invited_by) memberCounts[row.invited_by] = (memberCounts[row.invited_by] ?? 0) + 1
  }

  const result = owners.map(o => {
    const org = o.organization_id ? orgMap[o.organization_id] : null
    return {
      id:                o.id,
      email:             o.email,
      created_at:        o.created_at,
      organization_id:   o.organization_id,
      organization_name: org?.name ?? null,
      organization_city: org?.city ?? null,
      organization:      org ? {
        name: org.name, siret: org.siret, address: org.address, postal_code: org.postal_code,
        city: org.city, country: org.country, phone: org.phone, email: org.email,
      } : null,
      company_count:     companyCounts[o.id] ?? 0,
      member_count:      memberCounts[o.id] ?? 0,
    }
  })

  return NextResponse.json(result)
}

// POST — crée un owner avec sa société (obligatoire)
export async function POST(request: Request) {
  const ctx = await requireSuperAdmin()
  if (ctx instanceof NextResponse) return ctx
  const { db } = ctx

  const body = await request.json()
  const { email, password, company_name, siret, address, postal_code, city, country, phone, company_email } = body

  if (!email || !password) {
    return NextResponse.json({ error: 'Email et mot de passe requis' }, { status: 400 })
  }
  if (!company_name?.trim()) {
    return NextResponse.json({ error: 'La raison sociale est obligatoire' }, { status: 400 })
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
      const { data: existing } = await db
        .from('profiles')
        .select('id, user_type, organization_id')
        .eq('email', email)
        .maybeSingle()

      if (existing?.user_type === 'integrator') {
        return NextResponse.json({ error: 'Cet email est déjà un owner.' }, { status: 409 })
      }
      if (existing) {
        // Créer l'organisation et promouvoir le compte existant
        const { data: org } = await db
          .from('organizations')
          .insert({ name: company_name.trim(), siret: siret || null, address: address || null, postal_code: postal_code || null, city: city || null, country: country || 'France', phone: phone || null, email: company_email || null })
          .select('id').single()

        await db.from('profiles').update({
          user_type: 'integrator',
          organization_id: org?.id ?? null,
        }).eq('id', existing.id)

        return NextResponse.json({ upgraded: true, user_id: existing.id, email, organization_name: company_name }, { status: 200 })
      }
    }
    return NextResponse.json({ error: createError.message }, { status: 400 })
  }

  const newUserId = created.user.id

  // Créer l'organisation
  const { data: org, error: orgError } = await db
    .from('organizations')
    .insert({
      name:        company_name.trim(),
      siret:       siret        || null,
      address:     address      || null,
      postal_code: postal_code  || null,
      city:        city         || null,
      country:     country      || 'France',
      phone:       phone        || null,
      email:       company_email || null,
    })
    .select('id')
    .single()

  if (orgError) {
    // Annuler la création du compte si l'org échoue
    await db.auth.admin.deleteUser(newUserId)
    return NextResponse.json({ error: `Erreur organisation : ${orgError.message}` }, { status: 500 })
  }

  await db.from('profiles').update({
    user_type:       'integrator',
    organization_id: org.id,
  }).eq('id', newUserId)

  return NextResponse.json({ user_id: newUserId, email, organization_name: company_name }, { status: 201 })
}

// PATCH — attache ou modifie la société (organisation) d'un owner existant
export async function PATCH(request: Request) {
  const ctx = await requireSuperAdmin()
  if (ctx instanceof NextResponse) return ctx
  const { db } = ctx

  const body = await request.json().catch(() => ({}))
  const { user_id, company_name, siret, address, postal_code, city, country, phone, company_email } = body

  if (!user_id) return NextResponse.json({ error: 'user_id requis' }, { status: 400 })
  if (!company_name?.trim()) return NextResponse.json({ error: 'La raison sociale est obligatoire' }, { status: 400 })

  const { data: profile, error: profileError } = await db
    .from('profiles')
    .select('id, user_type, organization_id')
    .eq('id', user_id)
    .single()

  if (profileError || !profile) return NextResponse.json({ error: 'Owner introuvable' }, { status: 404 })
  if (profile.user_type !== 'integrator') return NextResponse.json({ error: "Ce compte n'est pas un owner" }, { status: 400 })

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

  if (profile.organization_id) {
    // Modifie la société existante
    const { error } = await db.from('organizations').update(orgFields).eq('id', profile.organization_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, organization_id: profile.organization_id, organization_name: orgFields.name })
  }

  // Crée une nouvelle société et l'attache au owner (cas des comptes créés avant le modèle B2B)
  const { data: org, error: orgError } = await db.from('organizations').insert(orgFields).select('id').single()
  if (orgError) return NextResponse.json({ error: orgError.message }, { status: 500 })

  const { error: updError } = await db.from('profiles').update({ organization_id: org.id }).eq('id', user_id)
  if (updError) return NextResponse.json({ error: updError.message }, { status: 500 })

  return NextResponse.json({ success: true, organization_id: org.id, organization_name: orgFields.name })
}

// DELETE — supprime un owner
export async function DELETE(request: Request) {
  const ctx = await requireSuperAdmin()
  if (ctx instanceof NextResponse) return ctx
  const { db } = ctx

  const { user_id } = await request.json()
  if (!user_id) return NextResponse.json({ error: 'user_id requis' }, { status: 400 })

  // Récupérer l'organization_id avant suppression
  const { data: profile } = await db.from('profiles').select('organization_id').eq('id', user_id).single()

  await db.from('company_members').delete().eq('user_id', user_id)
  const { error } = await db.auth.admin.deleteUser(user_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Supprimer l'organisation si plus personne ne l'utilise
  if (profile?.organization_id) {
    const { count } = await db
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', profile.organization_id)
    if ((count ?? 0) === 0) {
      await db.from('organizations').delete().eq('id', profile.organization_id)
    }
  }

  return NextResponse.json({ success: true })
}
