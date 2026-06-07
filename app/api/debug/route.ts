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
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )
}

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET() {
  const supabase = await getSessionClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })

  const admin = getAdminClient()

  const [profileRes, invitedRes, membershipsRes, companyMembersRes] = await Promise.all([
    admin.from('profiles').select('*').eq('id', user.id).single(),
    admin.from('profiles').select('id, email, user_type, invited_by').eq('invited_by', user.id),
    admin.from('company_members').select('company_id, role').eq('user_id', user.id),
    admin.from('company_members')
      .select('user_id, role, companies(id, company_name)')
      .eq('role', 'member')
      .in(
        'company_id',
        (await admin.from('company_members').select('company_id').eq('user_id', user.id).eq('role', 'owner'))
          .data?.map((r: { company_id: string }) => r.company_id) ?? []
      ),
  ])

  const memberUserIds = [...new Set((companyMembersRes.data ?? []).map((r: { user_id: string }) => r.user_id))]
  const membersInCompaniesProfiles = memberUserIds.length > 0
    ? (await admin.from('profiles').select('id, email, user_type, invited_by').in('id', memberUserIds)).data
    : []

  return NextResponse.json({
    connected_user: { id: user.id, email: user.email },
    profile: profileRes.data,
    invited_by_me: invitedRes.data ?? [],
    invited_by_me_count: (invitedRes.data ?? []).length,
    my_company_roles: membershipsRes.data ?? [],
    members_of_my_companies: companyMembersRes.data ?? [],
    members_of_my_companies_profiles: membersInCompaniesProfiles ?? [],
  })
}
