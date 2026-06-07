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

// POST — rejoindre ou mettre à jour un achat groupé
export async function POST(request: Request) {
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })

  const { product_id, quantity } = await request.json()
  if (!product_id) return NextResponse.json({ error: 'product_id requis' }, { status: 400 })

  const qty = Math.max(1, parseInt(quantity) || 1)
  const admin = getAdmin()

  // Vérifier que le produit est encore ouvert
  const { data: product } = await admin
    .from('premium_products')
    .select('id, status, unit_price_group, target_quantity, current_quantity')
    .eq('id', product_id)
    .single()

  if (!product) return NextResponse.json({ error: 'Produit introuvable' }, { status: 404 })
  if (product.status !== 'open') {
    return NextResponse.json({ error: 'Cet achat groupé n\'est plus ouvert' }, { status: 409 })
  }

  // Upsert — une seule commande par owner par produit
  const { data, error } = await admin
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
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })

  const { order_id } = await request.json()
  if (!order_id) return NextResponse.json({ error: 'order_id requis' }, { status: 400 })

  const admin = getAdmin()
  const { error } = await admin
    .from('premium_orders')
    .delete()
    .eq('id', order_id)
    .eq('owner_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
