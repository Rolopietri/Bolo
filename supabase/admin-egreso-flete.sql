-- Flete / delivery en egresos admin. Se anota en la misma moneda del egreso y
-- SE SUMA al monto (igual que en las compras de Cocina). `monto` guarda el total
-- (bienes + flete) y `flete` la porción de flete, para poder desglosarla.
-- Idempotente. Filas existentes: flete null (no tenían flete).
alter table public.admin_egreso add column if not exists flete numeric(16,2);
