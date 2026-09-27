-- Categorías de producto DEFINIDAS POR EL USUARIO (para el análisis de ventas).
-- Antes eran una lista fija en el código; ahora se gestionan desde la página
-- (Administración → Análisis de ventas → Clasificar productos) y se comparten
-- con los demás módulos (el formulario de receta usa la misma lista). El
-- producto guarda el NOMBRE de la categoría en recetas.categoria / insumos.categoria.
create table if not exists public.categoria_producto (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  orden int not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists idx_categoria_producto_nombre
  on public.categoria_producto (lower(nombre));

-- Categorías excluidas de los rankings (más vendido, mayor facturación, tops):
-- p.ej. alquileres fijos, eventos, alquileres por bloque — que por su valor
-- dominarían el análisis. Siguen sumando en totales y en "por categoría".
alter table public.categoria_producto
  add column if not exists excluir_ranking boolean not null default false;

alter table public.categoria_producto enable row level security;
drop policy if exists "catprod_select" on public.categoria_producto;
create policy "catprod_select" on public.categoria_producto for select to authenticated using (true);
drop policy if exists "catprod_insert" on public.categoria_producto;
create policy "catprod_insert" on public.categoria_producto for insert to authenticated with check (true);
drop policy if exists "catprod_update" on public.categoria_producto;
create policy "catprod_update" on public.categoria_producto for update to authenticated using (true) with check (true);
drop policy if exists "catprod_delete" on public.categoria_producto;
create policy "catprod_delete" on public.categoria_producto for delete to authenticated using (true);

-- Semilla inicial (puedes editarlas/borrarlas/agregar las tuyas desde la página).
insert into public.categoria_producto (nombre, orden) values
  ('Café espresso', 10),
  ('Café con leche', 20),
  ('Té e infusiones', 30),
  ('Limonadas', 40),
  ('Jugos y frutales', 50),
  ('Refrescos y sodas', 60),
  ('Smoothies', 70),
  ('Desayunos', 80),
  ('Sándwiches', 90),
  ('Bowls', 100),
  ('Platos fuertes', 110),
  ('Pasapalos / Tequeños', 120),
  ('Postres', 130),
  ('Repostería', 140),
  ('Otros', 999)
on conflict do nothing;
