-- Cocina · Merma por cocción en insumos (M5)
--
-- Guarda, por insumo, el % de peso que pierde al cocinarse. Sirve para
-- registrar pérdidas pesando el producto YA cocido (ej. tocineta): el sistema
-- convierte el peso cocido a su equivalente crudo antes de descontarlo del
-- stock, que se lleva en crudo.
--
--   crudo = cocido / (1 - merma_coccion_porc/100)
--   (tocineta con 70% → 100 g cocida ≈ 333 g cruda)
--
-- Nullable: la mayoría de los insumos no lo necesitan. Aditivo e idempotente.

alter table public.insumos
  add column if not exists merma_coccion_porc numeric(5, 2);

comment on column public.insumos.merma_coccion_porc is
  '% de peso que pierde el insumo al cocinarse (0-99). Para registrar '
  'pérdidas pesando el producto cocido y convertir a crudo.';
