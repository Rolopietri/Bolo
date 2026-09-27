-- Cocina · Compras: pago diferido (cuentas por pagar)
-- ════════════════════════════════════════════════════════════════
-- No siempre se le paga al proveedor en el momento de la compra. Agregamos un
-- estado de pago a cada compra:
--   • pagada    → true si ya se pagó (por defecto true: las compras existentes
--                 se asumen pagadas, y una compra nueva normal se paga al toque).
--   • fecha_pago → cuándo se pagó (null mientras está "por pagar").
--
-- No afecta el stock ni el precio (esos los siguen manejando los triggers de
-- insert/delete). Editar una compra se hace en la app como borrar + recrear, así
-- que reutiliza esos triggers y no hace falta un trigger de UPDATE.
--
-- Aditivo e idempotente.

alter table public.compras
  add column if not exists pagada boolean not null default true,
  add column if not exists fecha_pago date;

create index if not exists idx_compras_pagada
  on public.compras(pagada) where pagada = false;
