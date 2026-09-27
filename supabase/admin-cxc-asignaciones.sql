-- Administración · CXC: un cobro puede aplicarse a NE específicas
-- Guardamos en cada pago a qué cuentas (NE) se aplicó y cuánto a cada una,
-- para poder cobrar solo algunas cuentas (total o parcialmente) y calcular el
-- saldo restante por cuenta. Formato: [{cuenta_id, ref, eur, usd}, ...]
alter table public.admin_cxc_pago add column if not exists asignaciones jsonb;
