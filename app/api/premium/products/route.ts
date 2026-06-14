import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'

export async function GET() {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { user, db } = auth

  const [productsRes, ordersRes] = await Promise.all([
    db
      .from('premium_products')
      .select('*')
      .order('sort_order', { ascending: true }),
    db
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
