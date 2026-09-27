-- Categorías de INSUMOS definidas por el usuario, para el Análisis de Compras.
-- Espejo de categoria_producto (que es para ventas), pero INDEPENDIENTE: los
-- insumos son materia prima (Lácteos, Harinas, Empaques, Café…) y no tienen por
-- qué compartir lista con las categorías de venta (Smoothies, Alquileres…). Se
-- gestionan desde Administración → Análisis de Compras → Clasificar insumos.
-- El insumo guarda el NOMBRE de la categoría en insumos.categoria_compra.
create table if not exists public.categoria_insumo (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  orden int not null default 0,
  excluir_ranking boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists idx_categoria_insumo_nombre
  on public.categoria_insumo (lower(nombre));

alter table public.categoria_insumo enable row level security;
drop policy if exists "catins_select" on public.categoria_insumo;
create policy "catins_select" on public.categoria_insumo for select to authenticated using (true);
drop policy if exists "catins_insert" on public.categoria_insumo;
create policy "catins_insert" on public.categoria_insumo for insert to authenticated with check (true);
drop policy if exists "catins_update" on public.categoria_insumo;
create policy "catins_update" on public.categoria_insumo for update to authenticated using (true) with check (true);
drop policy if exists "catins_delete" on public.categoria_insumo;
create policy "catins_delete" on public.categoria_insumo for delete to authenticated using (true);

-- Columna donde el insumo guarda su categoría de compra (nombre). Es aparte de
-- insumos.categoria (que usa Ventas para insumos de reventa), así los dos
-- clasificadores no se pisan.
alter table public.insumos
  add column if not exists categoria_compra text;

-- Semilla de categorías típicas de compras (edítalas/bórralas desde la página).
insert into public.categoria_insumo (nombre, orden) values
  ('Lácteos', 10),
  ('Frutas y verduras', 20),
  ('Carnes y proteínas', 30),
  ('Panadería y harinas', 40),
  ('Abarrotes / secos', 50),
  ('Café y té', 60),
  ('Bebidas', 70),
  ('Endulzantes', 80),
  ('Snacks y golosinas', 90),
  ('Empaques y desechables', 100),
  ('Limpieza', 110),
  ('Otros', 999)
on conflict do nothing;

-- Migración suave: rescata las categorías que YA usan tus insumos, EXCEPTO las
-- que en realidad son de ventas (existen en categoria_producto → p.ej. el
-- azúcar quedó en "Alquileres fijos"). Esas se descartan y el insumo queda
-- "sin clasificar" para que lo asignes limpio desde la página.
insert into public.categoria_insumo (nombre, orden)
select distinct btrim(i.categoria), 500
from public.insumos i
where i.categoria is not null
  and btrim(i.categoria) <> ''
  and lower(btrim(i.categoria)) not in (
    select lower(nombre) from public.categoria_producto
  )
on conflict do nothing;

-- Copia la categoría existente a categoria_compra solo si quedó en la lista
-- nueva (es decir, si NO era una categoría de ventas colada).
update public.insumos i
set categoria_compra = c.nombre
from public.categoria_insumo c
where i.categoria_compra is null
  and i.categoria is not null
  and lower(btrim(i.categoria)) = lower(c.nombre);
