-- Renumérotation de TOUS les devis existants au nouveau format : <ORG3>-<ANNÉE>-<SEQ>
-- où SEQ est un compteur GLOBAL par année (ordre chronologique de création).
-- À exécuter UNE fois, APRÈS 20260610_quote_number_unique.sql.
--
-- Le préfixe = 3 premières lettres du nom de l'organisation du créateur du devis
-- (quotes.created_by → profiles.organization_id → organizations.name), accents retirés,
-- fallback 'DEV' si pas d'organisation.

-- On retire la contrainte le temps de la réécriture (évite les collisions transitoires)
alter table public.quotes drop constraint if exists quotes_quote_number_key;

with base as (
  select
    qt.id,
    extract(year from qt.created_at)::int as yr,
    qt.created_at,
    coalesce(
      nullif(
        substr(
          regexp_replace(
            upper(translate(
              lower(coalesce(org.name, '')),
              'àâäáãåçèéêëìíîïñòóôöõùúûüýÿ',
              'aaaaaaceeeeiiiinooooouuuuyy'
            )),
            '[^A-Z0-9]', '', 'g'
          ),
          1, 3
        ),
        ''
      ),
      'DEV'
    ) as prefix
  from public.quotes qt
  left join public.profiles      p   on p.id   = qt.created_by
  left join public.organizations org on org.id = p.organization_id
),
numbered as (
  select
    id, yr, prefix,
    row_number() over (partition by yr order by created_at, id) as seq
  from base
)
update public.quotes t
set quote_number = n.prefix || '-' || n.yr::text || '-' || lpad(n.seq::text, 4, '0')
from numbered n
where t.id = n.id;

-- Recaler le compteur global par année sur le nombre de devis (= dernier seq attribué)
insert into public.quote_number_seq (year, counter)
select extract(year from created_at)::int, count(*)
from public.quotes
group by extract(year from created_at)
on conflict (year) do update set counter = excluded.counter;

-- Remettre la contrainte d'unicité globale
alter table public.quotes add constraint quotes_quote_number_key unique (quote_number);
