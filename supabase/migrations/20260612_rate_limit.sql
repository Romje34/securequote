-- Rate limiting générique côté base de données (fenêtre glissante, atomique).
-- Utilisé pour brider les routes sensibles (inscription publique, génération IA, …)
-- sans dépendance externe (Redis). Une ligne = un évènement compté ; le compteur
-- glisse sur une fenêtre temporelle par « bucket » (ex. "signup:<ip>").

create table if not exists rate_limit_events (
  id         bigint generated always as identity primary key,
  bucket     text        not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_rate_limit_events_bucket_time
  on rate_limit_events (bucket, created_at desc);

-- La table n'est jamais lue/écrite directement par les clients : tout passe par la
-- fonction security definer ci-dessous. RLS activée sans policy => inaccessible en anon.
alter table rate_limit_events enable row level security;

-- Vérifie ET incrémente atomiquement le compteur d'un bucket sur une fenêtre.
--   p_max            : nombre d'évènements autorisés sur la fenêtre
--   p_window_seconds : durée de la fenêtre glissante, en secondes
-- Renvoie true si la requête est autorisée (et l'enregistre), false si la limite
-- est déjà atteinte (rien n'est enregistré).
create or replace function rate_limit_check(
  p_bucket         text,
  p_max            int,
  p_window_seconds int
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  -- Purge des évènements expirés de ce bucket (housekeeping borné).
  delete from rate_limit_events
   where bucket = p_bucket
     and created_at < now() - make_interval(secs => p_window_seconds);

  select count(*) into v_count
    from rate_limit_events
   where bucket = p_bucket
     and created_at >= now() - make_interval(secs => p_window_seconds);

  if v_count >= p_max then
    return false;  -- limite atteinte
  end if;

  insert into rate_limit_events (bucket) values (p_bucket);
  return true;     -- autorisé
end;
$$;
