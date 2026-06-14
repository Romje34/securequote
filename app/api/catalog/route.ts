import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'

export async function GET(request: Request) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { db } = auth

  const { searchParams } = new URL(request.url)
  const q        = searchParams.get('q')        ?? ''
  const category = searchParams.get('category') ?? ''

  let query = db
    .from('product_catalog')
    .select('id, brand, reference, designation, category, unit, list_price')
    .order('brand').order('designation')

  if (q) query = query.or(`designation.ilike.%${q}%,reference.ilike.%${q}%,brand.ilike.%${q}%`)
  if (category) query = query.eq('category', category)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
