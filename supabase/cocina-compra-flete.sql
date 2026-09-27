-- Cocina · Compras: flete / delivery del proveedor
-- ════════════════════════════════════════════════════════════════
-- Cargo de entrega que el proveedor suma a la factura al traer los insumos. Va
-- ASOCIADO a la compra (no es un gasto separado) y cuenta en el total de la
-- factura, pero NO se reparte en el precio unitario de cada insumo (es un cargo
-- de la factura completa, no del insumo). Por eso va en su propia columna y no
-- toca los triggers de stock/precio.
--
-- Como una factura puede tener varias líneas de compra (un insumo por línea), el
-- flete se anota UNA vez (en cualquier línea de esa factura); el resumen "por
-- factura" suma el flete de la factura.
--
-- Aditivo e idempotente.

alter table public.compras
  add column if not exists flete_usd numeric(12, 4);
