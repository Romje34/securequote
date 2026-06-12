import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET — liste les companies de l'utilisateur connecté
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }

  const admin = createAdminClient()

  // Étape 1 : companies dont l'utilisateur est directement owner
  const { data: ownedRows } = await supabase
    .from('company_members')
    .select('company_id')
    .eq('user_id', user.id)
    .eq('role', 'owner')

  const ownCompanyIds = (ownedRows ?? []).map((r) => r.company_id)

  // Étape 2 : collecter tous les membres via deux sources

  // Source A — profiles avec invited_by = user.id
  const { data: invitedProfiles } = await admin
    .from('profiles')
    .select('id, email')
    .eq('invited_by', user.id)

  // Source B — users avec role='member' dans les companies de l'owner
  let companyMemberProfiles: { id: string; email: string }[] = []
  if (ownCompanyIds.length > 0) {
    const { data: companyMemberRows } = await admin
      .from('company_members')
      .select('user_id')
      .in('company_id', ownCompanyIds)
      .eq('role', 'member')
      .neq('user_id', user.id)

    const idsFromCompanies = [...new Set((companyMemberRows ?? []).map((r) => r.user_id))]

    if (idsFromCompanies.length > 0) {
      const { data: profiles } = await admin
        .from('profiles')
        .select('id, email')
        .in('id', idsFromCompanies)
      companyMemberProfiles = profiles ?? []
    }
  }

  // Fusionner et dédupliquer les deux sources
  const memberEmailMap: Record<string, string> = {}
  for (const p of [...(invitedProfiles ?? []), ...companyMemberProfiles]) {
    memberEmailMap[p.id] = p.email ?? ''
  }
  const allMemberIds = Object.keys(memberEmailMap)

  // Étape 3 : companies dont ces membres sont owners (hors companies propres)
  const memberCompanyIds: string[] = []
  const memberOwnership: Record<string, string> = {}

  if (allMemberIds.length > 0) {
    const { data: memberOwnerships } = await admin
      .from('company_members')
      .select('user_id, company_id')
      .in('user_id', allMemberIds)
      .eq('role', 'owner')

    for (const cm of memberOwnerships ?? []) {
      if (!ownCompanyIds.includes(cm.company_id)) {
        memberCompanyIds.push(cm.company_id)
        memberOwnership[cm.company_id] = memberEmailMap[cm.user_id] ?? ''
      }
    }
  }

  // Étape 4 : récupérer toutes les companies
  const allIds = [...new Set([...ownCompanyIds, ...memberCompanyIds])]
  if (allIds.length === 0) return NextResponse.json([])

  const { data: companies, error } = await admin
    .from('companies')
    .select('id, company_name, city, country, email, phone, siret, vat_number, created_at')
    .in('id', allIds)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const result = (companies ?? []).map((c) => ({
    ...c,
    is_own: ownCompanyIds.includes(c.id),
    member_email: memberOwnership[c.id] ?? null,
  }))

  return NextResponse.json(result)
}

// POST — crée une company via RPC (atomique : company + owner)
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }

  const body = await request.json()
  const { company_name, email, phone, siret, vat_number, city, address_line_1, postal_code, country } = body

  if (!company_name) {
    return NextResponse.json({ error: 'company_name requis' }, { status: 400 })
  }
  if (!email?.trim() || !phone?.trim() || !siret?.trim() || !vat_number?.trim()) {
    return NextResponse.json({ error: 'email, téléphone, siret et numéro de TVA sont requis' }, { status: 400 })
  }

  const { data, error } = await supabase.rpc('create_company_with_owner', {
    p_company_name: company_name,
    p_city:         city        ?? null,
    p_address:      address_line_1 ?? null,
    p_postal_code:  postal_code ?? null,
    p_country:      country     ?? 'FR',
    p_email:        email.trim(),
    p_siret:        siret.trim(),
    p_vat_number:   vat_number.trim(),
    p_phone:        phone.trim(),
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data, { status: 201 })
}