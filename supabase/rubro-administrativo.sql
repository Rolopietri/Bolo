-- Rollup administrativo: agrupar categorías en un "rubro" solo para el análisis
-- de Administración. En Recetas/Cocina cada categoría se sigue usando tal cual.
-- Primer rubro: Smoothies + Bebidas naturales → "Smoothies y Bebidas Naturales".
-- (El índice único de categoria_producto es case-insensitive; todo va con lower().)

-- 1) Columna nueva (nullable). null = la categoría no se agrupa (se muestra sola).
alter table public.categoria_producto add column if not exists rubro text;

-- 2) "Bebidas naturales" ya existe como categoría de venta → no se inserta.

-- 3) Asignar el rubro a las dos categorías que se aglomeran en Admin.
update public.categoria_producto
set rubro = 'Smoothies y Bebidas Naturales'
where lower(nombre) in ('smoothies', 'bebidas naturales');

-- 4) Arreglo de dato: el coco frío es reventa "Bebidas naturales", no Smoothies.
--    Usa el nombre EXACTO de la categoría existente (respeta sus mayúsculas).
update public.insumos set categoria = (
  select nombre from public.categoria_producto where lower(nombre) = 'bebidas naturales' limit 1
)
where categoria = 'Smoothies' and nombre ilike '%coco fr%';
update public.recetas set categoria = (
  select nombre from public.categoria_producto where lower(nombre) = 'bebidas naturales' limit 1
)
where categoria = 'Smoothies' and nombre ilike '%coco fr%';
