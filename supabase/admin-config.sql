-- Administración · Ajustes del panel (clave/valor)
-- Guarda configuraciones simples que tú controlas, ej. la devaluación
-- mensual estimada del bolívar. Tabla CERRADA (RLS activo sin políticas).
create table if not exists public.admin_config (
  clave text primary key,
  valor text,
  updated_at timestamptz not null default now()
);
alter table public.admin_config enable row level security;
