-- Cocina · M5 — Merma de producción (pérdida interna de algo pre-producido)
-- ════════════════════════════════════════════════════════════════
-- Permite registrar que una ración (o varias) de una receta pre-producida
-- (ej. falafels congelados) se perdió por un fallo interno (falla de freidora,
-- quemado, contaminación, etc.) — NO una venta.
--
-- Diseño: la merma se inserta por el MISMO carril que las ventas, con la marca
-- `es_merma = true`. Así reutiliza los triggers ya probados que:
--   - descuentan del stock los insumos de la receta (flatten_receta_insumos,
--     incluye subrecetas), y
--   - liberan el compromiso de los planes de producción (cascada FIFO).
-- Pero al estar marcada como merma:
--   - no lleva precio (sin ingresos), y
--   - el código la excluye de los reportes/historial de venta (listVentas
--     filtra es_merma = false; listMermas trae solo es_merma = true).
--
-- No requiere cambios en los triggers (ya disparan en cualquier insert/delete
-- de ventas). Borrar una merma revierte stock y re-compromete, igual que
-- deshacer una venta.
--
-- Aditivo, idempotente.

alter table public.ventas
  add column if not exists es_merma boolean not null default false,
  add column if not exists merma_motivo text;

create index if not exists idx_ventas_es_merma on public.ventas(es_merma);
