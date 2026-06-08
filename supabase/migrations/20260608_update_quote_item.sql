create or replace function public.update_quote_item(
  p_id          uuid,
  p_designation text    default null,
  p_reference   text    default null,
  p_brand       text    default null,
  p_unit        text    default null,
  p_quantity    numeric default null,
  p_buy_price   numeric default null,
  p_sell_price  numeric default null,
  p_discount    numeric default null,
  p_is_labor    boolean default null,
  p_position    int     default null,
  p_row_type    text    default null,
  p_note_text   text    default null
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  result json;
begin
  update public.quote_items set
    designation = coalesce(p_designation, designation),
    reference   = coalesce(p_reference,   reference),
    brand       = coalesce(p_brand,       brand),
    unit        = coalesce(p_unit,        unit),
    quantity    = coalesce(p_quantity,    quantity),
    buy_price   = coalesce(p_buy_price,   buy_price),
    sell_price  = coalesce(p_sell_price,  sell_price),
    discount    = coalesce(p_discount,    discount),
    is_labor    = coalesce(p_is_labor,    is_labor),
    position    = coalesce(p_position,    position),
    row_type    = coalesce(p_row_type,    row_type),
    note_text   = p_note_text,
    updated_at  = now()
  where id = p_id
  returning row_to_json(quote_items.*) into result;

  return result;
end;
$$;
