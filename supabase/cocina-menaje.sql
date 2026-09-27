-- Cocina · M6 Menaje
-- Vajilla, cristalería, cubiertos, bandejas, utensilios, textiles — todo
-- material durable que no se vende pero hay que inventariar y gestionar
-- (roturas, deterioro, manchas, pérdidas, robo) + reposiciones por compra.
--
-- Idempotente. Aditivo — no toca tablas existentes.

-- ════════════════════════════════════════════════════════════════
-- 1. ITEMS del menaje
-- ════════════════════════════════════════════════════════════════
create table if not exists public.menaje_items (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  categoria text not null default 'Otros',        -- texto libre (Vajilla, Cristalería, Cubiertos...)
  descripcion text,
  cantidad_actual numeric(10, 2) not null default 0,
  cantidad_inicial numeric(10, 2),                -- referencia para saber cuánto entró originalmente
  precio_reposicion_usd numeric(10, 2),           -- opcional — para presupuestar reposiciones
  foto_url text,
  notas text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_menaje_categoria on public.menaje_items(categoria);

alter table public.menaje_items enable row level security;

drop policy if exists "menaje_select" on public.menaje_items;
create policy "menaje_select" on public.menaje_items
  for select to authenticated using (true);
drop policy if exists "menaje_insert" on public.menaje_items;
create policy "menaje_insert" on public.menaje_items
  for insert to authenticated with check (true);
drop policy if exists "menaje_update" on public.menaje_items;
create policy "menaje_update" on public.menaje_items
  for update to authenticated using (true) with check (true);
drop policy if exists "menaje_delete" on public.menaje_items;
create policy "menaje_delete" on public.menaje_items
  for delete to authenticated using (true);

drop trigger if exists menaje_set_updated on public.menaje_items;
create trigger menaje_set_updated
  before update on public.menaje_items
  for each row execute function public.set_updated_at();

-- ════════════════════════════════════════════════════════════════
-- 2. MOVIMIENTOS del menaje (bajas y compras)
-- ════════════════════════════════════════════════════════════════
-- Tipos canónicos:
--   Bajas (cantidad negativa): rotura | deterioro | mancha | perdida | robo | otro | ajuste
--   Entradas (cantidad positiva): compra | reposicion | ajuste
create table if not exists public.menaje_movimientos (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.menaje_items(id) on delete cascade,
  tipo text not null,
  cantidad numeric(10, 2) not null,             -- positivo=entra, negativo=sale
  motivo text,
  fecha date not null default current_date,
  factura_url text,                              -- enlace al archivo de factura en Storage
  factura_nombre text,                           -- nombre original del archivo para mostrar
  precio_unitario_usd numeric(10, 2),
  precio_total_usd numeric(10, 2),
  nota text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_menaje_mov_item on public.menaje_movimientos(item_id);
create index if not exists idx_menaje_mov_fecha on public.menaje_movimientos(fecha desc);
create index if not exists idx_menaje_mov_tipo on public.menaje_movimientos(tipo);

alter table public.menaje_movimientos enable row level security;

drop policy if exists "mmov_select" on public.menaje_movimientos;
create policy "mmov_select" on public.menaje_movimientos
  for select to authenticated using (true);
drop policy if exists "mmov_insert" on public.menaje_movimientos;
create policy "mmov_insert" on public.menaje_movimientos
  for insert to authenticated with check (true);
drop policy if exists "mmov_update" on public.menaje_movimientos;
create policy "mmov_update" on public.menaje_movimientos
  for update to authenticated using (true) with check (true);
drop policy if exists "mmov_delete" on public.menaje_movimientos;
create policy "mmov_delete" on public.menaje_movimientos
  for delete to authenticated using (true);

-- ════════════════════════════════════════════════════════════════
-- 3. STORAGE BUCKET para facturas (PDF/imagen)
-- ════════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public, file_size_limit)
values ('menaje-facturas', 'menaje-facturas', false, 10485760)  -- 10 MB max
on conflict (id) do nothing;

-- Policies: usuarios autenticados pueden subir, leer y borrar archivos del bucket
drop policy if exists "menaje_facturas_select" on storage.objects;
create policy "menaje_facturas_select" on storage.objects
  for select to authenticated using (bucket_id = 'menaje-facturas');

drop policy if exists "menaje_facturas_insert" on storage.objects;
create policy "menaje_facturas_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'menaje-facturas');

drop policy if exists "menaje_facturas_update" on storage.objects;
create policy "menaje_facturas_update" on storage.objects
  for update to authenticated using (bucket_id = 'menaje-facturas');

drop policy if exists "menaje_facturas_delete" on storage.objects;
create policy "menaje_facturas_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'menaje-facturas');
