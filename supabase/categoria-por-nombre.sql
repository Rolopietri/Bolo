-- Categoría de venta ASIGNADA POR NOMBRE del ítem del POS.
-- Sirve para clasificar en el análisis los ítems que NO son receta ni insumo de
-- reventa (consignación, servicios, "sin clasificar") — que no tienen dónde
-- guardar su categoría. Se matchea por el nombre normalizado del ítem tal como
-- llega del reporte (misma normalización que pos_clasificacion). La categoría
-- guardada es el NOMBRE de una categoria_producto.
create table if not exists public.categoria_por_nombre (
  id uuid primary key default gen_random_uuid(),
  nombre_norm text not null,
  nombre_original text not null,
  categoria text not null,
  updated_at timestamptz not null default now()
);
create unique index if not exists idx_categoria_por_nombre_norm
  on public.categoria_por_nombre (nombre_norm);

alter table public.categoria_por_nombre enable row level security;
drop policy if exists "catnombre_select" on public.categoria_por_nombre;
create policy "catnombre_select" on public.categoria_por_nombre for select to authenticated using (true);
drop policy if exists "catnombre_insert" on public.categoria_por_nombre;
create policy "catnombre_insert" on public.categoria_por_nombre for insert to authenticated with check (true);
drop policy if exists "catnombre_update" on public.categoria_por_nombre;
create policy "catnombre_update" on public.categoria_por_nombre for update to authenticated using (true) with check (true);
drop policy if exists "catnombre_delete" on public.categoria_por_nombre;
create policy "catnombre_delete" on public.categoria_por_nombre for delete to authenticated using (true);
