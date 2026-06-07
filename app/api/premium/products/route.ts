import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

async function getSupabase() {
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

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET() {
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })

  const admin = getAdmin()

  const [productsRes, ordersRes] = await Promise.all([
    admin
      .from('premium_products')
      .select('*')
      .order('sort_order', { ascending: true }),
    admin
      .from('premium_orders')
      .select('id, product_id, quantity, unit_price, status')
      .eq('owner_id', user.id)
      .neq('status', 'cancelled'),
  ])

  if (productsRes.error) {
    return NextResponse.json({ error: productsRes.error.message }, { status: 500 })
  }

  const orderMap: Record<string, { id: string; quantity: number; unit_price: number; status: string }> = {}
  for (const o of ordersRes.data ?? []) {
    orderMap[o.product_id] = { id: o.id, quantity: o.quantity, unit_price: o.unit_price, status: o.status }
  }

  const result = (productsRes.data ?? []).map(p => ({
    ...p,
    my_order: orderMap[p.id] ?? null,
  }))

  return NextResponse.json(result)
}
