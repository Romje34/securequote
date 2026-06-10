-- Bucket Storage "logos" + policies : identité visuelle des owners (logo, bandeau, signature).
-- Chaque utilisateur authentifié ne peut écrire que dans son propre dossier (préfixe = son user id).
-- Lecture publique (les visuels apparaissent sur les devis envoyés/PDF).

insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do update set public = true;

drop policy if exists "logos_read" on storage.objects;
create policy "logos_read" on storage.objects
  for select using (bucket_id = 'logos');

drop policy if exists "logos_insert" on storage.objects;
create policy "logos_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "logos_update" on storage.objects;
create policy "logos_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "logos_delete" on storage.objects;
create policy "logos_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text);
