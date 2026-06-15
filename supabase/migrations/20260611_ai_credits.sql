-- ============================================================
-- SecureQuote — Crédits IA : forfaits, abonnement org, registre d'usage
-- ============================================================
-- Périmètre : pool de crédits partagé au niveau de l'organisation.
-- 1 crédit = 1 000 tokens (entrée + sortie). Forfait mensuel par plan,
-- remis à zéro au 1er du mois calendaire (calcul à la volée via ai_usage).

-- ── Forfaits (paliers d'abonnement) ──────────────────────────
create table if not exists public.plans (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  monthly_credits int  not null default 0,
  price           numeric(10,2) not null default 0,
  sort_order      int  not null default 0,
  created_at      timestamptz default now()
);

alter table public.plans enable row level security;
drop policy if exists "plans_read_auth" on public.plans;
create policy "plans_read_auth"
  on public.plans for select
  using (auth.role() = 'authenticated');

-- Seed initial (uniquement si la table est vide)
insert into public.plans (name, monthly_credits, price, sort_order)
select * from (values
  ('Essentiel',  100,  17.00, 10),
  ('Pro',        400,  47.00, 20),
  ('Business',  1500, 127.00, 30)
) as v(name, monthly_credits, price, sort_order)
where not exists (select 1 from public.plans);

-- ── Abonnement de l'organisation ─────────────────────────────
alter table public.organizations
  add column if not exists plan_id uuid references public.plans(id);

-- Pas d'attribution automatique : les comptes existants sont des comptes
-- de test (email non vérifié). Les organisations démarrent sans forfait
-- (plan_id NULL = free tier de 5 devis IA offerts), l'abonnement sera posé
-- via le paiement (Stripe, à venir) ou manuellement par le superadmin.

-- ── Registre d'usage IA (source de vérité de la consommation) ─
create table if not exists public.ai_usage (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid references public.organizations(id) on delete cascade,
  user_id          uuid references auth.users(id) on delete set null,
  quote_id         uuid references public.quotes(id) on delete set null,
  mode             text not null default 'full',   -- full | chapter
  input_tokens     int  not null default 0,
  output_tokens    int  not null default 0,
  credits_consumed int  not null default 0,
  created_at       timestamptz default now()
);

create index if not exists ai_usage_org_created
  on public.ai_usage (organization_id, created_at);

-- RLS : un membre lit la consommation de SA propre organisation.
-- (Les insertions passent par la service-role depuis la route IA.)
alter table public.ai_usage enable row level security;
drop policy if exists "ai_usage_read_org" on public.ai_usage;
create policy "ai_usage_read_org"
  on public.ai_usage for select
  using (
    organization_id in (
      select organization_id from public.profiles where id = auth.uid()
    )
  );
