-- ============================================================
-- SecureQuote — Stripe : abonnement auto-service (Lot B)
-- ============================================================
-- Branche le paiement réel derrière le choix d'un forfait.
-- Le webhook Stripe met à jour organizations.plan_id (= déblocage IA).
-- 1 prix Stripe (récurrent mensuel) par forfait existant.

-- ── Lien forfait → prix Stripe ───────────────────────────────
-- Récupéré dans le Dashboard Stripe après création des 3 prix récurrents.
alter table public.plans
  add column if not exists stripe_price_id text;

-- ── Abonnement Stripe de l'organisation ──────────────────────
-- customer_id : créé au 1er checkout, réutilisé ensuite (1 client Stripe / org).
-- subscription_id + status : pilotés par le webhook (active, past_due, canceled…).
alter table public.organizations
  add column if not exists stripe_customer_id     text,
  add column if not exists stripe_subscription_id text,
  add column if not exists subscription_status    text;

-- Retrouver l'org à partir du client/abonnement Stripe dans le webhook.
create index if not exists organizations_stripe_customer
  on public.organizations (stripe_customer_id);
create index if not exists organizations_stripe_subscription
  on public.organizations (stripe_subscription_id);
