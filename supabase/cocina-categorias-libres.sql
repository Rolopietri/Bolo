-- Cocina · Categorías de insumo libres (texto)
-- ════════════════════════════════════════════════════════════════
-- Las categorías de materia prima pasan a ser TEXTO LIBRE (se pueden crear
-- categorías nuevas en cualquier momento desde el formulario, igual que el
-- menaje). El código ya no depende de los slugs fijos.
--
-- Esta migración unifica las categorías viejas (guardadas como slug, ej.
-- 'cafe') a su nombre legible (ej. 'Café & Té'), para que TODO el catálogo
-- quede parejo y no se dupliquen pills de filtro (slug viejo vs etiqueta nueva).
--
-- Solo afecta filas cuyo valor sea exactamente uno de los slugs conocidos.
-- Idempotente: correrla de nuevo no cambia nada (ya no quedan slugs).

update public.insumos set categoria = 'Café & Té'            where categoria = 'cafe';
update public.insumos set categoria = 'Lácteos'              where categoria = 'lacteos';
update public.insumos set categoria = 'Frutas & Vegetales'   where categoria = 'frutas';
update public.insumos set categoria = 'Panadería'            where categoria = 'panaderia';
update public.insumos set categoria = 'Proteínas'            where categoria = 'proteinas';
update public.insumos set categoria = 'Salsas & Aderezos'    where categoria = 'salsas';
update public.insumos set categoria = 'Bebidas'              where categoria = 'bebidas';
update public.insumos set categoria = 'Desechables'          where categoria = 'desechables';
update public.insumos set categoria = 'Condimentos & Especias' where categoria = 'condimentos';
update public.insumos set categoria = 'Snacks'               where categoria = 'snacks';
update public.insumos set categoria = 'Otros'                where categoria = 'otros';
