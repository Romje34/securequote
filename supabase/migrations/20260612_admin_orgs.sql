-- ============================================================
-- SecureQuote — Organisations actives : index conso IA par compte
-- ============================================================
-- Le tableau d'administration agrège la consommation IA par utilisateur.
-- Index dédié pour l'agrégat (organization_id, created_at) existe déjà
-- (ai_usage_org_created). On ajoute l'axe par utilisateur.

create index if not exists ai_usage_user_created
  on public.ai_usage (user_id, created_at);
