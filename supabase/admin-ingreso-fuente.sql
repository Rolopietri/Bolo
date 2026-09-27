-- Administración · marca de origen para los ingresos importados
-- Permite distinguir (y no duplicar) las ventas que entran desde Setux.
alter table public.admin_ingreso add column if not exists fuente text;
create index if not exists idx_admin_ingreso_fuente_fecha
  on public.admin_ingreso (fuente, fecha);
