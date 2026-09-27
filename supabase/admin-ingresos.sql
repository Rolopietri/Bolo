-- Administración · Ingresos y sus categorías
-- Tablas CERRADAS (RLS activo sin políticas): solo el servidor con la
-- contraseña de administración. Un ingreso es dinero que ENTRA; se clasifica
-- por categoría y, para alquileres, se anota el pagador (inquilino/cliente).

create table if not exists public.admin_categoria_ingreso (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists idx_admin_cati_nombre on public.admin_categoria_ingreso (lower(nombre));

create table if not exists public.admin_ingreso (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  concepto text,
  categoria_id uuid references public.admin_categoria_ingreso(id) on delete set null,
  categoria_nombre text,                 -- snapshot del nombre de categoría
  pagador text,                          -- quién pagó (inquilino/cliente)
  monto numeric(16,2),                   -- en moneda original
  moneda text,                           -- Bs | USD | EUR
  tasa numeric(16,4),
  monto_usd numeric(16,2),               -- equivalente calculado al registrar
  metodo text,
  factura text,                          -- factura/recibo
  nota text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_admin_ingreso_fecha on public.admin_ingreso (fecha);

alter table public.admin_categoria_ingreso enable row level security;
alter table public.admin_ingreso enable row level security;

drop trigger if exists admin_ingreso_set_updated on public.admin_ingreso;
create trigger admin_ingreso_set_updated
  before update on public.admin_ingreso
  for each row execute function public.set_updated_at();

-- Categorías de ingreso iniciales (se pueden editar/agregar después).
insert into public.admin_categoria_ingreso (nombre) values
  ('Alquiler'),
  ('Eventos'),
  ('Talleres'),
  ('Cafetería'),
  ('Donaciones'),
  ('Ventas'),
  ('Otros')
on conflict do nothing;
