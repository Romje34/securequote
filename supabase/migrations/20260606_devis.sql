-- ============================================================
-- SecureQuote — Module Devis Phase 1
-- ============================================================

-- Clients finaux de l'intégrateur (liés à une de ses sociétés)
create table if not exists public.clients (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  name         text not null,
  address      text,
  postal_code  text,
  city         text,
  country      text default 'FR',
  phone        text,
  email        text,
  siret        text,
  created_at   timestamptz default now()
);

alter table public.clients enable row level security;
drop policy if exists "clients_company_owner" on public.clients;
create policy "clients_company_owner" on public.clients for all
  using (exists (
    select 1 from public.company_members
    where company_id = clients.company_id
      and user_id = auth.uid()
      and role = 'owner'
  ));

-- Devis
create table if not exists public.quotes (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies(id) on delete cascade,
  client_id        uuid references public.clients(id) on delete set null,
  quote_number     text not null,
  status           text not null default 'draft',
  title            text,
  reference        text,
  site_address     text,
  issued_at        date default current_date,
  valid_until      date,
  salesperson      text,
  notes            text,
  conditions       text,
  tva_rate         numeric(5,2) default 20,
  show_references  boolean default true,
  show_brands      boolean default true,
  show_unit_prices boolean default true,
  show_quantities  boolean default true,
  show_chapter_totals boolean default true,
  created_by       uuid references auth.users(id),
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

alter table public.quotes enable row level security;
drop policy if exists "quotes_company_owner" on public.quotes;
create policy "quotes_company_owner" on public.quotes for all
  using (exists (
    select 1 from public.company_members
    where company_id = quotes.company_id
      and user_id = auth.uid()
      and role = 'owner'
  ));

-- Chapitres du devis
create table if not exists public.quote_chapters (
  id          uuid primary key default gen_random_uuid(),
  quote_id    uuid not null references public.quotes(id) on delete cascade,
  position    int  not null default 0,
  title       text not null,
  description text,
  created_at  timestamptz default now()
);

alter table public.quote_chapters enable row level security;
drop policy if exists "chapters_via_quote" on public.quote_chapters;
create policy "chapters_via_quote" on public.quote_chapters for all
  using (exists (
    select 1 from public.quotes q
    join public.company_members cm on cm.company_id = q.company_id
    where q.id = quote_chapters.quote_id
      and cm.user_id = auth.uid()
      and cm.role = 'owner'
  ));

-- Lignes du devis
create table if not exists public.quote_items (
  id           uuid primary key default gen_random_uuid(),
  chapter_id   uuid not null references public.quote_chapters(id) on delete cascade,
  quote_id     uuid not null references public.quotes(id) on delete cascade,
  position     int  not null default 0,
  designation  text not null default '',
  reference    text,
  brand        text,
  unit         text default 'U',
  quantity     numeric(10,3) not null default 1,
  buy_price    numeric(10,2) not null default 0,
  sell_price   numeric(10,2) not null default 0,
  discount     numeric(5,2)  not null default 0,
  is_labor     boolean default false,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

alter table public.quote_items enable row level security;
drop policy if exists "items_via_quote" on public.quote_items;
create policy "items_via_quote" on public.quote_items for all
  using (exists (
    select 1 from public.quotes q
    join public.company_members cm on cm.company_id = q.company_id
    where q.id = quote_items.quote_id
      and cm.user_id = auth.uid()
      and cm.role = 'owner'
  ));

-- updated_at triggers
drop trigger if exists quotes_updated_at on public.quotes;
create trigger quotes_updated_at before update on public.quotes
  for each row execute procedure public.set_updated_at();

drop trigger if exists items_updated_at on public.quote_items;
create trigger items_updated_at before update on public.quote_items
  for each row execute procedure public.set_updated_at();

-- Numérotation devis : prochain numéro pour une société/préfixe/année
create or replace function public.next_quote_number(
  p_company_id uuid,
  p_prefix     text default 'DEV'
)
returns text language plpgsql as $$
declare
  v_year  text := extract(year from now())::text;
  v_count int;
begin
  select count(*) + 1 into v_count
  from public.quotes
  where company_id = p_company_id
    and extract(year from created_at) = extract(year from now());
  return p_prefix || '-' || v_year || '-' || lpad(v_count::text, 4, '0');
end;
$$;
