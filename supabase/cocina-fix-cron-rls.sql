-- Tasa BCV · RLS
-- La escribe el cron diario con SERVICE-ROLE (ver src/app/api/cron/bcv/route.ts),
-- que bypassa RLS. La escritura ANÓNIMA está bloqueada: la anon key es pública
-- (va en el bundle del navegador), así que si se permitiera escribir, cualquiera
-- podría fijar una tasa FALSA y descuadrar todos los precios en Bs.
--
-- Anon solo puede LEER (la app muestra la tasa del día).
--
-- OJO: antes de aplicar esto, configura SUPABASE_SERVICE_ROLE_KEY en Vercel,
-- si no el cron/banner no podrá escribir la tasa.

-- Quitar cualquier permiso de escritura anónima (de versiones anteriores).
drop policy if exists "tasa_anon_insert" on public.tasa_bcv;
drop policy if exists "tasa_anon_update" on public.tasa_bcv;

-- Lectura anónima: permitida (mostrar la tasa en la app).
drop policy if exists "tasa_anon_select" on public.tasa_bcv;
create policy "tasa_anon_select" on public.tasa_bcv
  for select to anon using (true);
