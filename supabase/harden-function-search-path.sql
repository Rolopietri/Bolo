-- Endurecimiento: fija el search_path de todas las funciones del esquema public.
--
-- CONTEXTO
-- El Advisor de Supabase marca "Function Search Path Mutable" (lint 0011) en
-- cada función que no fija su search_path: sin fijarlo, hereda el del rol que la
-- llama, lo que abre un riesgo teórico de "search_path hijacking". Este script
-- lo fija a un valor estable (public, pg_temp) SIN cambiar la lógica de las
-- funciones — solo quita la ambigüedad del path.
--
-- Es idempotente: puedes correrlo las veces que quieras. Recorre las funciones
-- reales (prokind = 'f', incluye las de triggers) y no toca vistas ni tablas.
--
-- Cómo aplicarlo: pégalo en Supabase → SQL Editor y córrelo. Luego dale Refresh
-- al Security Advisor; los ~23 warnings de "Function Search Path Mutable" se van.

do $$
declare
  r record;
begin
  for r in
    select p.proname as name,
           pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'   -- solo funciones (incluye funciones de trigger)
  loop
    execute format(
      'alter function public.%I(%s) set search_path = public, pg_temp;',
      r.name, r.args
    );
  end loop;
end $$;

-- Verificación: lista funciones del esquema public cuyo search_path AÚN no está
-- fijado. Después de correr lo de arriba debe devolver 0 filas.
select p.proname,
       coalesce(array_to_string(p.proconfig, ', '), '(sin fijar)') as config
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prokind = 'f'
  and not exists (
    select 1 from unnest(coalesce(p.proconfig, '{}')) c
    where c like 'search_path=%'
  );
