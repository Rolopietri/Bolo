#!/usr/bin/env bash
# Prueba local de supabase/cocina-jornada-cierre.sql y
# cocina-jornada-horario.sql y cocina-jornada-sincro.sql en una base descartable.
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
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
create or replace function auth.uid()
returns uuid language sql stable as $$ select null::uuid $$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
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
  merma_coccion_porc numeric,
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
  responsable text,
  abierto_at timestamptz not null default now()
);


create table if not exists public.tasa_bcv (
  fecha date primary key,
  usd_bs numeric(20,4),
  eur_bs numeric(20,4),
  paralela_bs numeric(20,4),
  fuente text,
  created_at timestamptz default now()
);

create table if not exists public.compras (
  id uuid primary key default gen_random_uuid(),
  insumo_id uuid references public.insumos(id),
  proveedor_id uuid,
  fecha date not null default current_date,
  cantidad numeric,
  precio_total_usd numeric,
  precio_total_bs numeric,
  tasa_bcv_usada numeric,
  modalidad_pago text,
  notas text,
  numero_factura text,
  flete_usd numeric,
  pagada boolean default true,
  fecha_pago date,
  base_usd numeric,
  iva_usd numeric,
  exento_usd numeric,
  costo_usd numeric,
  cantidad_por_compra_snap numeric,
  created_at timestamptz default now()
);

create table if not exists public.ventas (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  receta_nombre text,
  cantidad numeric default 1,
  total_usd numeric default 0
);

create table if not exists public.stock_movimientos (
  id uuid primary key default gen_random_uuid(),
  insumo_id uuid references public.insumos(id),
  tipo text,
  capa text,
  cantidad numeric,
  motivo text,
  fecha date default current_date,
  nota text,
  created_at timestamptz default now()
);

create table if not exists public.procesamientos (
  id uuid primary key default gen_random_uuid(),
  insumo_id uuid references public.insumos(id),
  fecha date default current_date,
  crudo numeric,
  procesado numeric,
  merma_porc numeric,
  nota text,
  responsable text,
  origen text,
  created_by uuid,
  created_at timestamptz default now()
);

create table if not exists public.cocina_planes_produccion (
  id uuid primary key default gen_random_uuid(),
  receta_id uuid,
  receta_nombre text,
  raciones numeric,
  raciones_consumidas numeric default 0,
  fecha_objetivo date,
  nota text,
  estado text default 'pendiente',
  cancelado_at timestamptz
);
create table if not exists public.cocina_plan_compromisos (
  plan_id uuid references public.cocina_planes_produccion(id) on delete cascade,
  insumo_id uuid references public.insumos(id),
  cantidad numeric,
  unidad_base text
);
alter table public.insumos add column if not exists stock_comprometido numeric default 0;

create table if not exists public.produccion_pendientes (
  id uuid primary key default gen_random_uuid(),
  estado text,
  remitente text,
  resultado text,
  texto text,
  enviado_at timestamptz default now(),
  foto_file_id text
);
create table if not exists public.avisos_inventario (
  id uuid primary key default gen_random_uuid(),
  estado text
);
create table if not exists public.produccion_telegram (
  id integer primary key,
  secreto text,
  bot_token text,
  resumen_chat_id bigint
);

insert into public.insumos (id, nombre, unidad_base, stock_actual, stock_procesado, activo) values
  ('11111111-1111-1111-1111-111111111111', 'QA Lomito', 'g', 8, 10, true),
  ('22222222-2222-2222-2222-222222222222', 'QA Cebolla', 'g', 4, 0, true);
SQL

"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/cocina-jornada-cierre.sql"
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/cocina-jornada-horario.sql"
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/cocina-jornada-sincro.sql"
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/cocina-jornada-cierre-pruebas.sql"
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/cocina-jornada-sincro-pruebas.sql"

dropdb "$DB"
echo "OK: pruebas de jornada de cocina en base local descartable."
