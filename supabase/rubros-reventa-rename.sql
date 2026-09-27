-- Renombrar los rubros de reventa (ingresos) para alinearlos con las categorías
-- de insumo ya limpias. Cascada a categoria_producto + recetas + insumos.
-- Estas categorías son de VENTA (aplica_receta = false); solo cambian de nombre.

-- Adicionales/extras bebidas → Suplementos (igual que en insumos).
update public.categoria_producto set nombre = 'Suplementos' where nombre = 'Adicionales/extras bebidas';
update public.recetas             set categoria = 'Suplementos' where categoria = 'Adicionales/extras bebidas';
update public.insumos             set categoria = 'Suplementos' where categoria = 'Adicionales/extras bebidas';

-- Bebidas frías embotelladas/enlatadas → Bebidas (como quedó el tipo de insumo).
update public.categoria_producto set nombre = 'Bebidas' where nombre = 'Bebidas frías embotelladas/enlatadas';
update public.recetas             set categoria = 'Bebidas' where categoria = 'Bebidas frías embotelladas/enlatadas';
update public.insumos             set categoria = 'Bebidas' where categoria = 'Bebidas frías embotelladas/enlatadas';
