-- WiFi de invitados · registro por QR
-- ═══════════════════════════════════════════════════════════════════
-- El cliente escanea el QR de la mesa, cae en /wifi, llena el formulario
-- (nombre, correo, teléfono, fecha de nacimiento) y recién ahí ve la clave
-- del WiFi. Cada registro queda aquí para construir la base de clientes.
--
-- Aplicar en el SQL Editor de Supabase (ver supabase/README-migraciones.md).

-- ============================================================
-- INVITADOS REGISTRADOS
-- ============================================================
create table if not exists public.wifi_invitados (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  email text not null,
  telefono text not null,
  fecha_nacimiento date,
  acepta_promos boolean not null default true,
  visitas integer not null default 1,
  origen text,                 -- de dónde escaneó: ?p=terraza, ?p=barra, etc.
  primera_visita timestamptz not null default now(),
  ultima_visita timestamptz not null default now()
);

-- Un registro por correo: si el mismo cliente vuelve, se suma una visita.
create unique index if not exists wifi_invitados_email_uniq
  on public.wifi_invitados (lower(email));

create index if not exists wifi_invitados_ultima_visita_idx
  on public.wifi_invitados (ultima_visita desc);

alter table public.wifi_invitados enable row level security;

-- El invitado NO toca esta tabla: escribe el servidor con service-role.
-- El equipo (usuarios logueados en la app) sí puede consultarla y limpiarla.
drop policy if exists "wifi_inv_select" on public.wifi_invitados;
create policy "wifi_inv_select" on public.wifi_invitados
  for select to authenticated using (true);
drop policy if exists "wifi_inv_update" on public.wifi_invitados;
create policy "wifi_inv_update" on public.wifi_invitados
  for update to authenticated using (true) with check (true);
drop policy if exists "wifi_inv_delete" on public.wifi_invitados;
create policy "wifi_inv_delete" on public.wifi_invitados
  for delete to authenticated using (true);

-- ============================================================
-- CONFIGURACIÓN DEL WIFI (una sola fila)
-- ============================================================
create table if not exists public.wifi_config (
  id boolean primary key default true check (id),
  ssid text not null default '',
  clave text not null default '',
  mensaje text not null default '',
  updated_at timestamptz not null default now()
);

insert into public.wifi_config (id) values (true) on conflict (id) do nothing;

alter table public.wifi_config enable row level security;

-- Solo el equipo logueado ve y edita la clave. El invitado la recibe por el
-- endpoint del servidor, después de registrarse.
drop policy if exists "wifi_cfg_select" on public.wifi_config;
create policy "wifi_cfg_select" on public.wifi_config
  for select to authenticated using (true);
drop policy if exists "wifi_cfg_update" on public.wifi_config;
create policy "wifi_cfg_update" on public.wifi_config
  for update to authenticated using (true) with check (true);

-- ============================================================
-- REGISTRO ATÓMICO (lo llama el servidor con service-role)
-- ============================================================
create or replace function public.wifi_registrar(
  p_nombre text,
  p_email text,
  p_telefono text,
  p_nacimiento date,
  p_promos boolean,
  p_origen text
) returns table (nuevo boolean, visitas integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_visitas integer;
begin
  select id into v_id from public.wifi_invitados
   where lower(email) = lower(p_email) limit 1;

  if v_id is null then
    insert into public.wifi_invitados
      (nombre, email, telefono, fecha_nacimiento, acepta_promos, origen)
    values
      (p_nombre, p_email, p_telefono, p_nacimiento, p_promos, p_origen)
    returning wifi_invitados.visitas into v_visitas;
    return query select true, v_visitas;
  else
    update public.wifi_invitados set
      nombre = p_nombre,
      telefono = p_telefono,
      fecha_nacimiento = coalesce(p_nacimiento, fecha_nacimiento),
      acepta_promos = p_promos,
      origen = coalesce(p_origen, origen),
      visitas = wifi_invitados.visitas + 1,
      ultima_visita = now()
    where id = v_id
    returning wifi_invitados.visitas into v_visitas;
    return query select false, v_visitas;
  end if;
end;
$$;

-- El invitado no está logueado: se le permite ejecutar SOLO esta función
-- (que no devuelve la clave del WiFi, solo confirma el registro).
revoke all on function public.wifi_registrar(text, text, text, date, boolean, text) from public;
grant execute on function public.wifi_registrar(text, text, text, date, boolean, text)
  to anon, authenticated, service_role;
