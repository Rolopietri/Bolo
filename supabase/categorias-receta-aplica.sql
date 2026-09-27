-- Pieza 1 del reordenamiento de categorías del Recetario.
-- Las categorías de RECETA son un subconjunto de la taxonomía de ventas
-- (categoria_producto): se marcan con aplica_receta. El Recetario muestra solo
-- las marcadas; Administración/Ventas sigue viendo TODAS. No se borra ninguna
-- categoría de venta.

-- 1) Columna nueva.
alter table public.categoria_producto
  add column if not exists aplica_receta boolean not null default false;

-- 2) Renombrar a los nombres definitivos, con cascada a recetas e insumos
--    (para no perder su clasificación).
update public.categoria_producto set nombre = 'Smoothies' where nombre = 'Smoothies y jugos naturales';
update public.recetas             set categoria = 'Smoothies' where categoria = 'Smoothies y jugos naturales';
update public.insumos             set categoria = 'Smoothies' where categoria = 'Smoothies y jugos naturales';

update public.categoria_producto set nombre = 'Sándwiches' where nombre = 'Sándwich';
update public.recetas             set categoria = 'Sándwiches' where categoria in ('Sándwich', 'sandwich');
update public.insumos             set categoria = 'Sándwiches' where categoria in ('Sándwich', 'sandwich');

update public.categoria_producto set nombre = 'Postres y Snacks' where nombre = 'Postres';
update public.recetas             set categoria = 'Postres y Snacks' where categoria = 'Postres';
update public.insumos             set categoria = 'Postres y Snacks' where categoria = 'Postres';

update public.categoria_producto set nombre = 'Bebidas Alcohólicas' where nombre = 'Bebidas alchólicas';
update public.recetas             set categoria = 'Bebidas Alcohólicas' where categoria = 'Bebidas alchólicas';
update public.insumos             set categoria = 'Bebidas Alcohólicas' where categoria = 'Bebidas alchólicas';

-- 3) Categorías de receta nuevas (aún sin recetas; se llenarán después).
insert into public.categoria_producto (nombre, orden, aplica_receta) values
  ('Desayunos', 300, true),
  ('Bowls', 310, true),
  ('Platos Fuertes', 320, true)
on conflict do nothing;

-- 4) Marcar las 9 categorías de RECETA. El resto queda en false (solo Ventas):
--    Bebidas frías…, Adicionales/extras bebidas, Pádel, Alquileres fijos,
--    Eventos…, Bar of mix, Cocina clandestina.
update public.categoria_producto set aplica_receta = true
  where nombre in (
    'Café y té', 'Smoothies', 'Sándwiches', 'Pasapalos', 'Postres y Snacks',
    'Bebidas Alcohólicas', 'Desayunos', 'Bowls', 'Platos Fuertes'
  );
update public.categoria_producto set aplica_receta = false
  where nombre in (
    'Bebidas frías embotelladas/enlatadas', 'Adicionales/extras bebidas', 'Pádel',
    'Alquileres fijos', 'Eventos y alquileres por bloque',
    'Bar of mix (consignación)', 'Cocina clandestina (consignación)'
  );
