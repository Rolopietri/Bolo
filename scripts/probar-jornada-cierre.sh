#!/usr/bin/env bash
# Prueba local de supabase/cocina-jornada-cierre.sql en una base descartable.
# NO apunta a producción.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="${BOLO_JORNADA_TEST_DB:-bolo_jornada_test}"
PSQL=(psql -v ON_ERROR_STOP=1 -X -q)

if ! psql -d postgres -c 'select 1' >/dev/null 2>&1; then
  echo "No hay un Postgres local al que se pueda conectar. Arranca uno y reintenta."
  exit 1
fi

dropdb --if-exists "$DB"
createdb "$DB"

"${PSQL[@]}" -d "$DB" <<'SQL'
create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;

create table public.cocina_config (
  id integer primary key,
  food_cost_objetivo_porc numeric,
  updated_at timestamptz default now()
);
insert into public.cocina_config (id) values (1);

create table public.negocio_config (
  id integer primary key,
  nombre text,
  zona_horaria text,
  moneda_base text
);
insert into public.negocio_config (id, nombre, zona_horaria, moneda_base)
values (1, 'Prueba', 'America/Caracas', 'USD');

create table public.insumos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  unidad_base text,
  stock_actual numeric default 0,
  stock_procesado numeric default 0,
  activo boolean default true
);

create table public.cierre_caja (
  id uuid primary key default gen_random_uuid(),
  fecha date not null unique,
  nota text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.procesamientos_abiertos (
  id uuid primary key default gen_random_uuid(),
  insumo_id uuid not null references public.insumos(id),
  crudo numeric not null,
  abierto_at timestamptz not null default now()
);

insert into public.insumos (id, nombre, unidad_base, stock_actual, stock_procesado, activo) values
  ('11111111-1111-1111-1111-111111111111', 'QA Lomito', 'g', 8, 10, true),
  ('22222222-2222-2222-2222-222222222222', 'QA Cebolla', 'g', 4, 0, true);
SQL

"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/cocina-jornada-cierre.sql"
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/cocina-jornada-cierre-pruebas.sql"

dropdb "$DB"
echo "OK: pruebas de jornada de cocina en base local descartable."
