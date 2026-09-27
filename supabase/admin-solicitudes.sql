-- Administración · Solicitudes de pago (y sus líneas)
-- Tablas CERRADAS (RLS activo sin políticas): solo el servidor con la
-- contraseña de administración. Una solicitud = "hay que pagar esto";
-- NO es un egreso hasta que se confirme el pago (fase posterior).

create table if not exists public.admin_solicitud (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  estado text not null default 'pendiente',   -- pendiente | procesada
  nota text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_solicitud_linea (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null references public.admin_solicitud(id) on delete cascade,
  orden int not null default 0,
  tipo text not null default 'proveedor',      -- proveedor | adicional
  proveedor_id uuid references public.admin_proveedor(id) on delete set null,
  proveedor_nombre text,                        -- snapshot del nombre
  datos_registrados boolean not null default false,
  concepto text,
  monto numeric(16,2),
  moneda text,                                  -- Bs | USD | EUR
  metodo text,                                  -- Transferencia | Zelle | Efectivo | USDT | ...
  tasa numeric(16,4),
  tasa_tipo text,                               -- dólar | del día | promedio | VNC | USDT | otra
  factura text,
  nota text
);
create index if not exists idx_admin_sol_linea on public.admin_solicitud_linea (solicitud_id);

alter table public.admin_solicitud enable row level security;
alter table public.admin_solicitud_linea enable row level security;

drop trigger if exists admin_sol_set_updated on public.admin_solicitud;
create trigger admin_sol_set_updated
  before update on public.admin_solicitud
  for each row execute function public.set_updated_at();
