-- Administración · Origen del egreso (para egresos automáticos de Setux, p. ej. RPP)
-- Permite distinguir los egresos creados por la importación de Setux y poder
-- reemplazarlos al re-importar el mismo día (igual que ingresos y cuentas).
alter table public.admin_egreso
  add column if not exists fuente text;  -- null = manual | 'setux' = importado

create index if not exists idx_admin_egreso_fuente_fecha
  on public.admin_egreso (fuente, fecha) where fuente is not null;

-- Categoría para las cortesías (RPP). No pisa las existentes.
insert into public.admin_categoria (nombre, clasificacion) values
  ('Cortesías','variable')
on conflict do nothing;
