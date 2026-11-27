-- Esquema mínimo descartable para probar cocina-zzzz-arreglos-qa.sql
create extension if not exists pgcrypto;

create table if not exists public.insumos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  unidad_base text not null default 'unidad',
  unidad_compra text not null default 'unidad',
  cantidad_por_compra numeric not null default 1,
  stock_actual numeric not null default 0,
  stock_procesado numeric not null default 0,
  stock_comprometido numeric not null default 0,
  se_procesa boolean not null default false,
  se_usa_por_lotes boolean not null default false,
  precio_compra_usd numeric,
  precio_base_usd numeric,
  precio_actualizado date,
  proveedor_id uuid,
  ultima_fecha date,
  ultima_cantidad numeric,
  ultima_precio_usd numeric,
  ultima_precio_bs numeric,
  penultima_fecha date,
  penultima_cantidad numeric,
  penultima_precio_usd numeric,
  penultima_precio_bs numeric,
  merma_coccion_porc numeric
);

create table if not exists public.stock_movimientos (
  id uuid primary key default gen_random_uuid(),
  insumo_id uuid not null references public.insumos(id) on delete cascade,
  tipo text not null,
  capa text not null default 'total',
  cantidad numeric(12, 4) not null,
  motivo text,
  fecha date not null default current_date,
  nota text,
  created_at timestamptz not null default now(),
  created_by uuid
);

create table if not exists public.produccion_pendientes (
  id uuid primary key default gen_random_uuid(),
  chat_id bigint,
  message_id bigint,
  estado text not null,
  resultado jsonb,
  remitente text,
  texto text,
  foto_file_id text,
  enviado_at timestamptz not null default now(),
  aplicado_at timestamptz
);

create table if not exists public.telegram_respuestas (
  chat_id bigint not null,
  bot_message_id bigint not null,
  pendiente_id uuid not null references public.produccion_pendientes(id),
  primary key (chat_id, bot_message_id)
);

create table if not exists public.produccion_telegram (
  id int primary key,
  secreto text
);
insert into public.produccion_telegram (id, secreto) values (1, 'test-secreto')
  on conflict (id) do update set secreto = excluded.secreto;

create table if not exists public.procesamientos_abiertos (
  id uuid primary key default gen_random_uuid(),
  insumo_id uuid not null,
  crudo numeric,
  responsable text,
  origen text,
  pendiente_id uuid,
  abierto_at timestamptz default now()
);

create table if not exists public.procesamientos (
  id uuid primary key default gen_random_uuid(),
  insumo_id uuid not null,
  fecha date,
  crudo numeric,
  procesado numeric,
  merma_porc numeric,
  nota text,
  responsable text,
  origen text,
  created_by uuid,
  created_at timestamptz default now()
);

create table if not exists public.menaje_items (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  cantidad_actual numeric not null default 0,
  precio_reposicion_usd numeric
);

create table if not exists public.cocina_config (
  id int primary key,
  recupera_iva_compras boolean
);
insert into public.cocina_config (id, recupera_iva_compras) values (1, true)
  on conflict (id) do nothing;

create table if not exists public.compras (
  id uuid primary key default gen_random_uuid(),
  insumo_id uuid not null references public.insumos(id),
  proveedor_id uuid,
  fecha date not null,
  cantidad numeric not null,
  precio_total_usd numeric,
  precio_total_bs numeric,
  tasa_bcv_usada numeric,
  modalidad_pago text,
  notas text,
  numero_factura text,
  flete_usd numeric,
  pagada boolean,
  fecha_pago date,
  base_usd numeric,
  iva_usd numeric,
  exento_usd numeric,
  costo_usd numeric,
  cantidad_por_compra_snap numeric,
  created_at timestamptz not null default now()
);

create table if not exists public.cocina_planes_produccion (
  id uuid primary key default gen_random_uuid(),
  estado text,
  raciones numeric,
  raciones_consumidas numeric
);
create table if not exists public.cocina_plan_compromisos (
  plan_id uuid,
  insumo_id uuid,
  cantidad numeric
);

create or replace function public._prod_hoy()
returns date language sql stable as $$
  select (timezone('America/Caracas', now()))::date
$$;

create or replace function public.recalcular_stock_comprometido()
returns void language sql as $$ select 1 $$;

-- Helper ya en producción (PR #25). Copia mínima para el Postgres local.
create or replace function public.bolo_rechazar_stock_negativo(
  p_insumo_id uuid,
  p_delta numeric
) returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_stock numeric;
  v_nombre text;
  v_unidad text;
  v_nuevo numeric;
begin
  select coalesce(stock_actual, 0),
         coalesce(nombre, 'Insumo'),
         coalesce(nullif(unidad_base, ''), nullif(unidad_compra, ''), '')
    into v_stock, v_nombre, v_unidad
    from public.insumos
   where id = p_insumo_id
   for update;
  if not found then
    return;
  end if;
  v_nuevo := v_stock + coalesce(p_delta, 0);
  if v_nuevo < 0 then
    raise exception 'BOLO_STOCK_NEGATIVO|%|%|%|%',
      replace(v_nombre, '|', ' '),
      trim(to_char(v_stock, 'FM999999990.999999')),
      v_unidad,
      trim(to_char(-v_nuevo, 'FM999999990.999999'))
      using errcode = 'P0001';
  end if;
end;
$$;

create table if not exists public.avisos_inventario (
  id uuid primary key default gen_random_uuid(),
  insumo_id uuid,
  venta_id uuid,
  tipo text,
  cantidad numeric,
  estado text default 'pendiente'
);

create table if not exists public.stock_auditoria (
  id uuid primary key default gen_random_uuid(),
  insumo_id uuid,
  insumo_nombre text,
  unidad_base text,
  stock_anterior numeric,
  stock_nuevo numeric,
  comprometido_anterior numeric,
  comprometido_nuevo numeric,
  origen text,
  changed_by uuid,
  motivo text,
  created_at timestamptz default now()
);

create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;

-- Roles de Supabase; en el cluster local de prueba se crean si faltan.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end $$;
