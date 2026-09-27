-- Cocina · M5 stock 3 capas
-- Agrega stock_comprometido a insumos. Mantiene stock_actual con su nombre
-- en DB (no rompemos triggers ni código SQL existente) pero en código se
-- expone como `stockTotal`.
--
-- stockTotal       = stock_actual         (físico — solo cambia con compra/pérdida)
-- stockComprometido = stock_comprometido  (reservado por planes activos)
-- stockLibre        = stockTotal - stockComprometido (lo que alerta/pedido usan)
--
-- Aditivo, idempotente — corre seguro varias veces.

alter table public.insumos
  add column if not exists stock_comprometido numeric(12, 4) not null default 0;

-- Asegurar valor no negativo
update public.insumos
   set stock_comprometido = 0
 where stock_comprometido is null or stock_comprometido < 0;
