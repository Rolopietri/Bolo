-- ═══════════════════════════════════════════════════════════════════
-- Bolo · Endurecimiento de seguridad (Security Advisor de Supabase)
-- ═══════════════════════════════════════════════════════════════════
-- No cambia la lógica de ninguna función ni borra datos. Corrige tres avisos
-- que el Advisor reportó en el proyecto Bolo el 1 de octubre de 2026:
--
-- 1. ERROR · v_tasa_bcv_actual es una vista "security definer": la consulta
--    se ejecuta con los permisos de quien creó la vista y se salta RLS. Pasa a
--    "security invoker". No pierde acceso: tasa_bcv ya tiene políticas de
--    lectura para anon y authenticated. Ninguna pantalla usa esta vista hoy.
--
-- 2. WARN · 16 funciones sin search_path fijo (riesgo de "search_path
--    hijacking"). Se fija a (public, pg_temp), igual que el resto. Ninguna de
--    ellas usa funciones de extensiones, así que no cambia qué resuelven.
--    OJO: si más adelante se reaplica un archivo viejo con
--    "create or replace function" de alguna de ellas, el search_path se
--    pierde. Basta con volver a correr este archivo.
--
-- 3. WARN · negocio_zona_horaria() (de bolo-01) se podía llamar sin sesión
--    (rol anon). Pasa a "security invoker" y se le quita el permiso a anon. La
--    lee cualquier usuario con sesión gracias a la política de
--    negocio_config. Lo mismo con negocio_hoy().
--
-- Avisos que se dejan A PROPÓSITO:
--   • Tablas admin_* "RLS enabled, no policy": así deben estar. Solo el
--     servidor las lee con la llave de servicio, detrás de ADMIN_PASSWORD.
--   • wifi_registrar callable por anon: es el formulario público del QR de
--     WiFi (módulo oculto en Bolo, pero su ruta /wifi sigue viva).
--   • bolo_rol / bolo_tiene_rol / bolo_puede_configurar callables por
--     authenticated: es intencional; solo devuelven el rol de quien pregunta.
--   • "Leaked password protection": se activa desde el panel de Supabase
--     (Authentication → Policies), no por SQL. Conviene activarlo: el login
--     de Bolo es por contraseña (una cuenta compartida, ver LoginForm.tsx).
--
-- Idempotente: se puede correr varias veces.
-- ═══════════════════════════════════════════════════════════════════

-- 1. Vista de la tasa BCV con los permisos de quien consulta.
alter view public.v_tasa_bcv_actual set (security_invoker = true);

-- 2. search_path fijo en TODAS las funciones de public que no lo tengan.
do $$
declare
  r record;
begin
  for r in
    select p.proname as nombre,
           pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and not exists (
        select 1 from unnest(coalesce(p.proconfig, '{}')) c
        where c like 'search_path=%'
      )
  loop
    execute format(
      'alter function public.%I(%s) set search_path = public, pg_temp',
      r.nombre, r.args);
  end loop;
end;
$$;

-- 3. Zona horaria del negocio: sin acceso anónimo.
create or replace function public.negocio_zona_horaria()
returns text
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(
    (select zona_horaria from public.negocio_config where id = 1),
    'America/Caracas'
  );
$$;

revoke execute on function public.negocio_zona_horaria() from public, anon;
revoke execute on function public.negocio_hoy() from public, anon;
grant execute on function public.negocio_zona_horaria() to authenticated, service_role;
grant execute on function public.negocio_hoy() to authenticated, service_role;
