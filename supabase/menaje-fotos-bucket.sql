-- Bucket PÚBLICO para fotos de ítems de menaje (cristalería, vajilla, etc.).
--
-- A diferencia de las facturas (bucket privado `menaje-facturas`, con signed
-- URLs), las fotos de producto NO son sensibles: se muestran directo en la app
-- y en el PDF del cliente. Por eso este bucket es público.
--
-- Cómo aplicarlo: pégalo en Supabase → SQL Editor y córrelo una vez.

-- 1) Crear el bucket público (idempotente).
insert into storage.buckets (id, name, public)
values ('menaje-fotos', 'menaje-fotos', true)
on conflict (id) do update set public = true;

-- 2) Lectura pública: cualquiera con el link ve la imagen (necesario para que
--    el <img> de la app y el <Image> del PDF la carguen sin autenticación).
drop policy if exists "menaje_fotos_public_read" on storage.objects;
create policy "menaje_fotos_public_read"
  on storage.objects for select
  using (bucket_id = 'menaje-fotos');

-- 3) Subir / actualizar / borrar: solo usuarios autenticados (tu equipo).
drop policy if exists "menaje_fotos_auth_insert" on storage.objects;
create policy "menaje_fotos_auth_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'menaje-fotos');

drop policy if exists "menaje_fotos_auth_update" on storage.objects;
create policy "menaje_fotos_auth_update"
  on storage.objects for update to authenticated
  using (bucket_id = 'menaje-fotos');

drop policy if exists "menaje_fotos_auth_delete" on storage.objects;
create policy "menaje_fotos_auth_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'menaje-fotos');
