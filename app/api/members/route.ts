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

// GET — liste les membres de l'intégrateur connecté
export async function GET() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY manquante' }, { status: 500 })
  }
  try {
    const supabase = await getSessionClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })

    const db = adm()

    const { data: members, error } = await db
      .from('profiles')
      .select('id, email')
      .eq('invited_by', user.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!members || members.length === 0) return NextResponse.json([])

    const memberIds = members.map(m => m.id)

    const { data: memberships } = await db
      .from('company_members')
      .select('user_id, companies(id, company_name, city)')
      .in('user_id', memberIds)
      .eq('role', 'owner')

    const companiesByMember: Record<string, { id: string; company_name: string; city: string | null }[]> = {}
    for (const m of memberships ?? []) {
      if (!companiesByMember[m.user_id]) companiesByMember[m.user_id] = []
      if (m.companies) {
        const cos = Array.isArray(m.companies) ? m.companies : [m.companies]
        for (const co of cos) {
          companiesByMember[m.user_id].push(co as { id: string; company_name: string; city: string | null })
        }
      }
    }

    const result = members.map(m => ({
      ...m,
      companies: companiesByMember[m.id] ?? [],
    }))

    return NextResponse.json(result)
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur interne' }, { status: 500 })
  }
}

// POST — crée un compte membre rattaché à l'organisation de l'owner
export async function POST(request: Request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY manquante' }, { status: 500 })
  }
  try {
    const supabase = await getSessionClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })

    const { email, password } = await request.json()
    if (!email || !password) {
      return NextResponse.json({ error: 'email et password sont requis' }, { status: 400 })
    }

    const db = adm()

    // Récupérer l'organisation de l'owner pour l'hériter au membre
    const { data: ownerProfile } = await db
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    const ownerOrgId = ownerProfile?.organization_id ?? null

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
          .select('id, email, invited_by')
          .eq('email', email)
          .maybeSingle()

        if (existing) {
          if (existing.invited_by === user.id) {
            return NextResponse.json({ already_member: true, user_id: existing.id, email }, { status: 200 })
          } else if (!existing.invited_by) {
            await db.from('profiles').update({
              user_type:       'client',
              invited_by:      user.id,
              organization_id: ownerOrgId,
            }).eq('id', existing.id)
            return NextResponse.json({ user_id: existing.id, email }, { status: 201 })
          } else {
            return NextResponse.json(
              { error: 'Cette adresse email est déjà rattachée à un autre owner.' },
              { status: 409 }
            )
          }
        }
      }
      return NextResponse.json({ error: createError.message }, { status: 400 })
    }

    const newUserId = created.user.id

    // Rattacher le membre à l'owner ET à son organisation
    await db.from('profiles').update({
      user_type:       'client',
      invited_by:      user.id,
      organization_id: ownerOrgId,
    }).eq('id', newUserId)

    // Rattacher aux companies de l'owner
    const { data: ownedCompanies } = await supabase
      .from('company_members')
      .select('company_id')
      .eq('user_id', user.id)
      .eq('role', 'owner')

    if (ownedCompanies && ownedCompanies.length > 0) {
      await db.from('company_members').insert(
        ownedCompanies.map(c => ({ company_id: c.company_id, user_id: newUserId, role: 'member' }))
      )
    }

    return NextResponse.json({ user_id: newUserId, email }, { status: 201 })
  } catch (err: unknown) {
    console.error('[api/members POST]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur interne' }, { status: 500 })
  }
}

// DELETE — supprime définitivement un compte membre
export async function DELETE(request: Request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY manquante' }, { status: 500 })
  }
  try {
    const supabase = await getSessionClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })

    const { user_id } = await request.json()
    if (!user_id) return NextResponse.json({ error: 'user_id requis' }, { status: 400 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('invited_by')
      .eq('id', user_id)
      .single()

    if (!profile || profile.invited_by !== user.id) {
      return NextResponse.json({ error: 'non autorisé' }, { status: 403 })
    }

    const db = adm()
    await db.from('company_members').delete().eq('user_id', user_id)
    const { error } = await db.auth.admin.deleteUser(user_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error('[api/members DELETE]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur interne' }, { status: 500 })
  }
}
