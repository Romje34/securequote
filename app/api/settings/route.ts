import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })

  const { data, error } = await supabase
    .from('owner_branding')
    .select('*')
    .eq('owner_id', user.id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? {})
}

export async function PUT(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })

  const body = await request.json()

  const allowed = [
    'trade_name', 'address', 'postal_code', 'city', 'country',
    'phone', 'email', 'website', 'siret', 'vat_number',
    'logo_url', 'header_image_url', 'signature_url', 'primary_color',
    'default_conditions', 'default_validity_days', 'default_tva_rate',
    'quote_prefix', 'footer_text',
  ]
  const payload: Record<string, unknown> = { owner_id: user.id }
  for (const key of allowed) {
    if (key in body) payload[key] = body[key]
  }

  const { data, error } = await supabase
    .from('owner_branding')
    .upsert(payload, { onConflict: 'owner_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
