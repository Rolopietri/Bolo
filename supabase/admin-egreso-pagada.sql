-- Estado de pago en egresos admin → habilita "cuentas por pagar" manuales.
-- Un egreso con pagada=false es una CUENTA POR PAGAR (aún no salió el dinero):
-- no cuenta en el total de egresos (caja real) hasta que se marca pagada.
-- Las compras de Cocina ya tienen su propio `pagada` (cocina-compra-pago-diferido).
-- Idempotente. Las filas existentes quedan pagada=true (ya eran gasto real).
alter table public.admin_egreso
  add column if not exists pagada boolean not null default true,
  add column if not exists fecha_pago date;

create index if not exists idx_admin_egreso_por_pagar
  on public.admin_egreso(pagada) where pagada = false;
