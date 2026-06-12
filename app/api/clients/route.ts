import { NextResponse } from 'next/server'
import { requireUser, userCanAccessCompany } from '@/lib/auth'

export async function GET(request: Request) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { user, db } = auth

  const { searchParams } = new URL(request.url)
  const company_id = searchParams.get('company_id')
  if (!company_id) return NextResponse.json({ error: 'company_id requis' }, { status: 400 })
  if (!(await userCanAccessCompany(db, user.id, company_id))) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  const { data, error } = await db
    .from('clients')
    .select('id, name, city, email, phone')
    .eq('company_id', company_id)
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: Request) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { user, db } = auth

  const body = await request.json()
  const { company_id, name, address, postal_code, city, country, phone, email, siret } = body
  if (!company_id || !name?.trim()) {
    return NextResponse.json({ error: 'company_id et name requis' }, { status: 400 })
  }
  if (!(await userCanAccessCompany(db, user.id, company_id))) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  const { data, error } = await db
    .from('clients')
    .insert({ company_id, name: name.trim(), address, postal_code, city, country, phone, email, siret })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
