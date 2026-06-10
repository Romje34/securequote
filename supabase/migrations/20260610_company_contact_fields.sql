-- Champs obligatoires supplémentaires sur les sociétés : email, SIRET, n° TVA.
-- Colonnes nullables en base (les sociétés existantes n'en ont pas) ;
-- l'obligation est imposée à la création par le front + l'API.

alter table public.companies add column if not exists email      text;
alter table public.companies add column if not exists siret      text;
alter table public.companies add column if not exists vat_number text;

-- Recréer le RPC avec les 3 nouveaux paramètres (on supprime l'ancienne signature 5-args)
drop function if exists public.create_company_with_owner(text, text, text, text, text);

create or replace function public.create_company_with_owner(
  p_company_name text,
  p_city         text default null,
  p_address      text default null,
  p_postal_code  text default null,
  p_country      text default 'FR',
  p_email        text default null,
  p_siret        text default null,
  p_vat_number   text default null
)
returns json
language plpgsql
security definer
as $function$
declare
  v_company_id uuid;
  v_user_id    uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  insert into companies (company_name, city, address_line_1, postal_code, country, email, siret, vat_number)
  values (p_company_name, p_city, p_address, p_postal_code, p_country, p_email, p_siret, p_vat_number)
  returning id into v_company_id;

  insert into company_members (company_id, user_id, role)
  values (v_company_id, v_user_id, 'owner');

  return json_build_object(
    'company_id', v_company_id,
    'user_id',    v_user_id,
    'role',       'owner'
  );
end;
$function$;
