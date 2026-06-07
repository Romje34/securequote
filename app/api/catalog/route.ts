import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function adm() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q        = searchParams.get('q')        ?? ''
  const category = searchParams.get('category') ?? ''

  let query = adm()
    .from('product_catalog')
    .select('id, brand, reference, designation, category, unit, list_price')
    .order('brand').order('designation')

  if (q) query = query.or(`designation.ilike.%${q}%,reference.ilike.%${q}%,brand.ilike.%${q}%`)
  if (category) query = query.eq('category', category)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
