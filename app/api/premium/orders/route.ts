import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'

// POST — rejoindre ou mettre à jour un achat groupé
export async function POST(request: Request) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { user, db } = auth

  const { product_id, quantity } = await request.json()
  if (!product_id) return NextResponse.json({ error: 'product_id requis' }, { status: 400 })

  const qty = Math.max(1, parseInt(quantity) || 1)

  // Vérifier que le produit est encore ouvert
  const { data: product } = await db
    .from('premium_products')
    .select('id, status, unit_price_group, target_quantity, current_quantity')
    .eq('id', product_id)
    .single()

  if (!product) return NextResponse.json({ error: 'Produit introuvable' }, { status: 404 })
  if (product.status !== 'open') {
    return NextResponse.json({ error: 'Cet achat groupé n\'est plus ouvert' }, { status: 409 })
  }

  // Upsert — une seule commande par owner par produit
  const { data, error } = await db
    .from('premium_orders')
    .upsert(
      {
        product_id,
        owner_id: user.id,
        quantity: qty,
        unit_price: product.unit_price_group,
        status: 'pending',
      },
      { onConflict: 'product_id,owner_id' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

// DELETE — annuler son engagement
export async function DELETE(request: Request) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { user, db } = auth

  const { order_id } = await request.json()
  if (!order_id) return NextResponse.json({ error: 'order_id requis' }, { status: 400 })

  const { error } = await db
    .from('premium_orders')
    .delete()
    .eq('id', order_id)
    .eq('owner_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
