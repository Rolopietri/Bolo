-- Administración · Proveedores (base de datos)
-- Tabla CERRADA (RLS activo sin políticas): solo el servidor con la contraseña
-- de administración la lee/escribe, igual que el resto de admin_*.

create table if not exists public.admin_proveedor (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  concepto text,               -- producto o servicio que ofrece
  cedula text,
  rif text,
  numero_cuenta text,
  banco text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_admin_prov_nombre on public.admin_proveedor (lower(nombre));

alter table public.admin_proveedor enable row level security;

drop trigger if exists admin_prov_set_updated on public.admin_proveedor;
create trigger admin_prov_set_updated
  before update on public.admin_proveedor
  for each row execute function public.set_updated_at();
