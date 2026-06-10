-- Référence devis GLOBALEMENT unique.
-- Format : <PREFIXE>-<ANNÉE>-<COMPTEUR_GLOBAL>  ex. SEC-2026-0042
-- Le préfixe (3 lettres du nom de l'organisation) est fourni par l'application.
-- Le compteur est GLOBAL (partagé par toutes les organisations / sociétés / users),
-- ce qui garantit qu'aucun devis ne partage la même référence.

-- 1) Compteur global par année (table dédiée, incrément atomique)
create table if not exists public.quote_number_seq (
  year    int  primary key,
  counter int  not null default 0
);

-- 2) Nouvelle fonction de numérotation : compteur global atomique
--    (on supprime les anciennes signatures avant de recréer)
drop function if exists public.next_quote_number(uuid, text);
drop function if exists public.next_quote_number(text);

create or replace function public.next_quote_number(p_prefix text default 'DEV')
returns text language plpgsql as $$
declare
  v_year  int := extract(year from now())::int;
  v_count int;
begin
  insert into public.quote_number_seq (year, counter)
  values (v_year, 1)
  on conflict (year) do update
    set counter = public.quote_number_seq.counter + 1
  returning counter into v_count;

  return p_prefix || '-' || v_year::text || '-' || lpad(v_count::text, 4, '0');
end;
$$;

-- 3) Initialiser le compteur de l'année courante au-dessus des devis déjà créés
--    (évite toute collision avec l'ancienne numérotation par société)
insert into public.quote_number_seq (year, counter)
select extract(year from now())::int, count(*)
from public.quotes
where extract(year from created_at) = extract(year from now())
on conflict (year) do update
  set counter = greatest(public.quote_number_seq.counter, excluded.counter);

-- 4) Dé-dupliquer d'éventuelles références déjà en double avant d'imposer l'unicité
with d as (
  select id, row_number() over (partition by quote_number order by created_at, id) as rn
  from public.quotes
)
update public.quotes q
set quote_number = q.quote_number || '-' || d.rn
from d
where q.id = d.id and d.rn > 1;

-- 5) Imposer l'unicité globale de la référence
alter table public.quotes drop constraint if exists quotes_quote_number_key;
alter table public.quotes add  constraint quotes_quote_number_key unique (quote_number);
