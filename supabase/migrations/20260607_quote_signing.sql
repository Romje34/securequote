-- Consultation et signature électronique des devis via lien public tokenisé
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS public_token   uuid UNIQUE DEFAULT gen_random_uuid();
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS sent_at        timestamptz;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS signed_at      timestamptz;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS signed_by      text;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS signature_ip   text;

-- S'assure que les devis existants disposent bien d'un token (pour les lignes créées avant l'ajout du DEFAULT)
UPDATE public.quotes SET public_token = gen_random_uuid() WHERE public_token IS NULL;
