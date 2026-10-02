-- ═══════════════════════════════════════════════════════════════════
-- Bolo · E2 · Configuración del negocio
-- ═══════════════════════════════════════════════════════════════════
-- Qué agrega (todo ADITIVO: no borra ni modifica tablas existentes):
--   • negocio_config   → una fila: nombre, zona horaria, moneda, módulos del menú.
--   • negocio_area     → áreas del negocio (Cocina, Barra, Administración…),
--                        editables; reemplazan la lista fija de Quinta Mamá.
--   • negocio_persona  → responsables. Pueden tener login (user_id) o no
--                        (p. ej. un cocinero sin cuenta). Si tienen login,
--                        llevan un rol: gerente | cocina | administracion.
--   • negocio_hoy()    → la fecha de HOY en la zona horaria del negocio
--                        (por defecto America/Caracas), no en UTC.
--   • bolo_rol(), bolo_tiene_rol(), bolo_puede_configurar() → permisos.
--
-- Cómo aplicarlo: Supabase → SQL Editor → pegar → Run. Es idempotente: se
-- puede correr varias veces sin duplicar nada.
--
-- Arranque: mientras NO exista ninguna persona activa con rol "gerente",
-- cualquier usuario con sesión puede configurar (modo instalación). En cuanto
-- se nombra el primer gerente, solo los gerentes pueden cambiar la
-- configuración. Leerla pueden todos los usuarios con sesión.
-- ═══════════════════════════════════════════════════════════════════

-- Misma función que en schema.sql; se repite aquí (idéntica) para que este
-- archivo no dependa del SQL de Tareas.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ───────────────────────────────────────────────────────────────────
-- negocio_config (una sola fila, id = 1)
-- ───────────────────────────────────────────────────────────────────
create table if not exists public.negocio_config (
  id            int primary key default 1 check (id = 1),
  nombre        text not null default 'Mi negocio',
  zona_horaria  text not null default 'America/Caracas',
  moneda_base   text not null default 'USD',
  modulos       text[] not null default array['cocina', 'administracion'],
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

insert into public.negocio_config (id) values (1) on conflict (id) do nothing;

-- La zona horaria debe ser un nombre válido de Postgres (pg_timezone_names).
create or replace function public.negocio_config_validar()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from pg_timezone_names where name = new.zona_horaria) then
    raise exception 'Zona horaria no válida: %', new.zona_horaria
      using errcode = '22023';
  end if;
  if new.modulos is null or cardinality(new.modulos) = 0 then
    raise exception 'Debe quedar al menos un módulo activo'
      using errcode = '22023';
  end if;
  new.nombre := btrim(new.nombre);
  if new.nombre = '' then
    raise exception 'El nombre del negocio no puede quedar vacío'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists negocio_config_validar on public.negocio_config;
create trigger negocio_config_validar
  before insert or update on public.negocio_config
  for each row execute function public.negocio_config_validar();

drop trigger if exists negocio_config_set_updated_at on public.negocio_config;
create trigger negocio_config_set_updated_at
  before update on public.negocio_config
  for each row execute function public.set_updated_at();

-- ───────────────────────────────────────────────────────────────────
-- negocio_area
-- ───────────────────────────────────────────────────────────────────
create table if not exists public.negocio_area (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null check (btrim(nombre) <> ''),
  activo      boolean not null default true,
  orden       int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Sin nombres repetidos (ignorando mayúsculas y espacios).
create unique index if not exists negocio_area_nombre_uq
  on public.negocio_area (lower(btrim(nombre)));

drop trigger if exists negocio_area_set_updated_at on public.negocio_area;
create trigger negocio_area_set_updated_at
  before update on public.negocio_area
  for each row execute function public.set_updated_at();

-- ───────────────────────────────────────────────────────────────────
-- negocio_persona
-- ───────────────────────────────────────────────────────────────────
create table if not exists public.negocio_persona (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null check (btrim(nombre) <> ''),
  user_id     uuid references auth.users (id) on delete set null,
  rol         text check (rol in ('gerente', 'cocina', 'administracion')),
  area_id     uuid references public.negocio_area (id) on delete set null,
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Un rol solo tiene sentido si la persona tiene login.
  constraint negocio_persona_rol_requiere_login check (rol is null or user_id is not null)
);

-- Una cuenta de login = una sola persona.
create unique index if not exists negocio_persona_user_uq
  on public.negocio_persona (user_id) where user_id is not null;

create index if not exists negocio_persona_area_idx
  on public.negocio_persona (area_id);

drop trigger if exists negocio_persona_set_updated_at on public.negocio_persona;
create trigger negocio_persona_set_updated_at
  before update on public.negocio_persona
  for each row execute function public.set_updated_at();

-- ───────────────────────────────────────────────────────────────────
-- Fecha de hoy en la zona horaria del negocio
-- ───────────────────────────────────────────────────────────────────
create or replace function public.negocio_zona_horaria()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select zona_horaria from public.negocio_config where id = 1),
    'America/Caracas'
  );
$$;

create or replace function public.negocio_hoy()
returns date
language sql
stable
set search_path = public, pg_temp
as $$
  select (now() at time zone public.negocio_zona_horaria())::date;
$$;

-- ───────────────────────────────────────────────────────────────────
-- Permisos
-- ───────────────────────────────────────────────────────────────────
-- security definer: leen negocio_persona sin depender de sus políticas RLS
-- (evita recursión cuando las políticas de negocio_persona los usan).

create or replace function public.bolo_rol()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select rol from public.negocio_persona
  where user_id = auth.uid() and activo
  limit 1;
$$;

create or replace function public.bolo_tiene_rol(p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.bolo_rol() = any (p_roles), false);
$$;

create or replace function public.bolo_puede_configurar()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and (
    public.bolo_tiene_rol(array['gerente'])
    or not exists (
      select 1 from public.negocio_persona
      where rol = 'gerente' and activo and user_id is not null
    )
  );
$$;

revoke all on function public.bolo_rol() from public, anon;
revoke all on function public.bolo_tiene_rol(text[]) from public, anon;
revoke all on function public.bolo_puede_configurar() from public, anon;
grant execute on function public.bolo_rol() to authenticated;
grant execute on function public.bolo_tiene_rol(text[]) to authenticated;
grant execute on function public.bolo_puede_configurar() to authenticated;
grant execute on function public.negocio_hoy() to authenticated;
grant execute on function public.negocio_zona_horaria() to authenticated;

-- No dejar al negocio sin gerente: si la última persona gerente activa con
-- login deja de serlo (cambio de rol, desactivación, borrado o pérdida del
-- login), se rechaza.
create or replace function public.negocio_persona_proteger_gerente()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  era_gerente boolean;
  sigue_gerente boolean := false;
begin
  era_gerente := old.rol = 'gerente' and old.activo and old.user_id is not null;
  if tg_op = 'UPDATE' then
    sigue_gerente := coalesce(
      new.rol = 'gerente' and new.activo and new.user_id is not null, false);
  end if;
  if era_gerente and not sigue_gerente and not exists (
    select 1 from public.negocio_persona
    where id <> old.id and rol = 'gerente' and activo and user_id is not null
  ) then
    raise exception 'Debe quedar al menos una persona con rol de gerente'
      using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists negocio_persona_proteger_gerente on public.negocio_persona;
create trigger negocio_persona_proteger_gerente
  before update or delete on public.negocio_persona
  for each row execute function public.negocio_persona_proteger_gerente();

-- ───────────────────────────────────────────────────────────────────
-- RLS
-- ───────────────────────────────────────────────────────────────────
alter table public.negocio_config  enable row level security;
alter table public.negocio_area    enable row level security;
alter table public.negocio_persona enable row level security;

-- negocio_config: leer todos; modificar solo quien puede configurar.
-- (Sin INSERT ni DELETE: la fila id=1 la crea este script.)
drop policy if exists "negocio_config_select" on public.negocio_config;
create policy "negocio_config_select" on public.negocio_config
  for select to authenticated using (true);
drop policy if exists "negocio_config_update" on public.negocio_config;
create policy "negocio_config_update" on public.negocio_config
  for update to authenticated
  using (public.bolo_puede_configurar())
  with check (public.bolo_puede_configurar());

-- negocio_area y negocio_persona: leer todos; escribir quien puede configurar.
do $$
declare
  t text;
begin
  foreach t in array array['negocio_area', 'negocio_persona'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.bolo_puede_configurar())',
      t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.bolo_puede_configurar()) with check (public.bolo_puede_configurar())',
      t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.bolo_puede_configurar())',
      t || '_delete', t);
  end loop;
end;
$$;

-- ───────────────────────────────────────────────────────────────────
-- Áreas iniciales (genéricas, para cafetería/restaurante). Se pueden
-- renombrar o desactivar desde la app. Solo se insertan si la tabla está
-- vacía, así que volver a correr el script no las duplica ni revive las
-- que se hayan borrado.
-- ───────────────────────────────────────────────────────────────────
insert into public.negocio_area (nombre, orden)
select v.nombre, v.orden
from (values
  ('Cocina', 10),
  ('Barra', 20),
  ('Salón', 30),
  ('Compras', 40),
  ('Administración', 50)
) as v (nombre, orden)
where not exists (select 1 from public.negocio_area);
