-- Cocina · IVA configurable (M4 Rentabilidad)
-- Agrega el porcentaje de IVA aplicable a precios de carta. Default 16%
-- (Venezuela). Editable desde la pantalla de Rentabilidad.
--
-- Aditivo, idempotente — corre seguro varias veces.

alter table public.cocina_config
  add column if not exists iva_porc numeric(5, 2) not null default 16;

-- Asegurar que la fila singleton (id=1) tenga el valor por defecto si ya existía
update public.cocina_config
   set iva_porc = 16
 where id = 1 and iva_porc is null;
