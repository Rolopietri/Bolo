-- Administración · Egresos y categorías
-- Tablas CERRADAS (RLS activo sin políticas): solo el servidor con la
-- contraseña de administración. Un egreso es un pago YA confirmado; puede
-- nacer a mano o al confirmar una línea de solicitud (solicitud_linea_id).

create table if not exists public.admin_categoria (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  clasificacion text not null default 'variable',  -- fija | variable
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists idx_admin_cat_nombre on public.admin_categoria (lower(nombre));

create table if not exists public.admin_egreso (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  concepto text,
  categoria_id uuid references public.admin_categoria(id) on delete set null,
  categoria_nombre text,                 -- snapshot del nombre de categoría
  clasificacion text,                    -- fija | variable (snapshot)
  proveedor_id uuid references public.admin_proveedor(id) on delete set null,
  proveedor_nombre text,                 -- snapshot del nombre del proveedor
  monto numeric(16,2),                   -- en moneda original
  moneda text,                           -- Bs | USD | EUR
  tasa numeric(16,4),
  monto_usd numeric(16,2),               -- equivalente calculado al registrar
  metodo text,
  factura text,
  nota text,
  solicitud_linea_id uuid references public.admin_solicitud_linea(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_admin_egreso_fecha on public.admin_egreso (fecha);
-- Evita registrar dos veces el egreso de la misma línea de solicitud.
create unique index if not exists idx_admin_egreso_sollinea
  on public.admin_egreso (solicitud_linea_id) where solicitud_linea_id is not null;

alter table public.admin_categoria enable row level security;
alter table public.admin_egreso enable row level security;

drop trigger if exists admin_egreso_set_updated on public.admin_egreso;
create trigger admin_egreso_set_updated
  before update on public.admin_egreso
  for each row execute function public.set_updated_at();

-- Categorías iniciales (se pueden editar/agregar después).
insert into public.admin_categoria (nombre, clasificacion) values
  ('Alquiler','fija'),
  ('Nómina','fija'),
  ('Servicios','fija'),
  ('Seguros','fija'),
  ('Impuestos','fija'),
  ('Insumos','variable'),
  ('Mantenimiento','variable'),
  ('Mercadeo','variable'),
  ('Eventos','variable'),
  ('Honorarios','variable'),
  ('Otros','variable')
on conflict do nothing;
