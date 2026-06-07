-- Table owner_branding : identité visuelle de chaque owner (intégrateur)
-- 1 ligne par owner — utilisée pour personnaliser les devis envoyés aux clients

create table if not exists public.owner_branding (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid not null unique references auth.users(id) on delete cascade,

  -- Identité commerciale
  trade_name            text,
  address               text,
  postal_code           text,
  city                  text,
  country               text default 'FR',
  phone                 text,
  email                 text,
  website               text,
  siret                 text,
  vat_number            text,

  -- Visuels (URL Supabase Storage)
  logo_url              text,
  header_image_url      text,
  signature_url         text,
  primary_color         text default '#1a1a2e',

  -- Paramètres devis par défaut
  default_conditions    text,
  default_validity_days int  default 30,
  default_tva_rate      numeric(5,2) default 20.00,
  quote_prefix          text default 'DEV',
  footer_text           text,

  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

-- Row Level Security : chaque owner ne voit et ne modifie que sa propre ligne
alter table public.owner_branding enable row level security;

drop policy if exists "owner_branding_self" on public.owner_branding;
create policy "owner_branding_self"
  on public.owner_branding for all
  using  (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Mise à jour automatique de updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists owner_branding_updated_at on public.owner_branding;
create trigger owner_branding_updated_at
  before update on public.owner_branding
  for each row execute procedure public.set_updated_at();

-- Bucket Storage pour les logos (à créer dans Supabase Dashboard > Storage)
-- Nom : logos — public : oui
-- Politique : tout utilisateur authentifié peut uploader dans son propre dossier (owner_id/)
