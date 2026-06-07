-- ── Organizations : société de l'intégrateur (tenant B2B) ────────────────────
-- Chaque owner appartient à une organisation (sa propre société).
-- Chaque member hérité de l'organisation de son owner.
-- Distinct des `companies` (sociétés-clientes pour lesquelles on génère des devis).

CREATE TABLE IF NOT EXISTS public.organizations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,         -- Raison sociale (obligatoire)
  siret       text,
  address     text,
  postal_code text,
  city        text,
  country     text NOT NULL DEFAULT 'France',
  phone       text,
  email       text,
  created_at  timestamptz DEFAULT now()
);

-- Rattacher chaque profil à son organisation
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);

-- RLS
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Lecture : tout membre de l'org peut voir sa propre org
CREATE POLICY "orgs_select_own"
  ON public.organizations FOR SELECT
  USING (
    id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- Mise à jour : seul l'owner (integrator) peut modifier son org
CREATE POLICY "orgs_update_own"
  ON public.organizations FOR UPDATE
  USING (
    id IN (
      SELECT organization_id FROM public.profiles
      WHERE id = auth.uid() AND user_type = 'integrator'
    )
  );
