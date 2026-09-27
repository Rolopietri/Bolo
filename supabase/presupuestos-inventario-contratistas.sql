-- Catálogos para Presupuestos: inventario de alquiler (mobiliario) +
-- contratistas (servicios de terceros que ofrecemos al cliente).
-- Aditivo, no toca tablas existentes.

-- ============================================================
-- INVENTARIO DE ALQUILER
-- ============================================================
create table if not exists public.inventario_alquiler (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  categoria text not null default 'Otros',  -- texto libre, editable por usuario
  descripcion text,
  cantidad_disponible int not null default 0,
  precio_alquiler_usd numeric(10, 2),
  estado text not null default 'disponible',  -- 'disponible' | 'mantenimiento' | 'agotado'
  foto_url text,
  notas text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_inv_categoria on public.inventario_alquiler(categoria);

alter table public.inventario_alquiler enable row level security;

drop policy if exists "inv_select" on public.inventario_alquiler;
create policy "inv_select" on public.inventario_alquiler
  for select to authenticated using (true);
drop policy if exists "inv_insert" on public.inventario_alquiler;
create policy "inv_insert" on public.inventario_alquiler
  for insert to authenticated with check (true);
drop policy if exists "inv_update" on public.inventario_alquiler;
create policy "inv_update" on public.inventario_alquiler
  for update to authenticated using (true) with check (true);
drop policy if exists "inv_delete" on public.inventario_alquiler;
create policy "inv_delete" on public.inventario_alquiler
  for delete to authenticated using (true);

drop trigger if exists inv_set_updated on public.inventario_alquiler;
create trigger inv_set_updated
  before update on public.inventario_alquiler
  for each row execute function public.set_updated_at();

-- ============================================================
-- CONTRATISTAS (servicios de terceros)
-- ============================================================
create table if not exists public.contratistas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  especialidad text not null default 'Otros',  -- texto libre, editable por usuario
  contacto_nombre text,
  contacto_telefono text,
  contacto_email text,
  precio_referencial_usd numeric(10, 2),
  comision_porc numeric(5, 2),
  notas text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_contra_especialidad on public.contratistas(especialidad);

alter table public.contratistas enable row level security;

drop policy if exists "contra_select" on public.contratistas;
create policy "contra_select" on public.contratistas
  for select to authenticated using (true);
drop policy if exists "contra_insert" on public.contratistas;
create policy "contra_insert" on public.contratistas
  for insert to authenticated with check (true);
drop policy if exists "contra_update" on public.contratistas;
create policy "contra_update" on public.contratistas
  for update to authenticated using (true) with check (true);
drop policy if exists "contra_delete" on public.contratistas;
create policy "contra_delete" on public.contratistas
  for delete to authenticated using (true);

drop trigger if exists contra_set_updated on public.contratistas;
create trigger contra_set_updated
  before update on public.contratistas
  for each row execute function public.set_updated_at();
