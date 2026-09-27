-- Administración · Tickets por día (del "Reporte Detallado por Factura")
-- Guarda, por día, cuántas facturas (tickets) hubo y su total, para el ticket
-- promedio. Se llena al cargar el reporte por factura. Tabla CERRADA (RLS).
create table if not exists public.admin_ticket_dia (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  tickets int not null default 0,
  total_bruto numeric(16,2) not null default 0,  -- Total Venta (con IVA), sin propina
  total_neto numeric(16,2) not null default 0,   -- Venta Neta (sin IVA)
  propina numeric(16,2) not null default 0,
  moneda text default 'EUR',
  fuente text,                                    -- 'factura'
  created_at timestamptz not null default now()
);
create unique index if not exists idx_admin_ticket_dia_fecha on public.admin_ticket_dia (fecha);
alter table public.admin_ticket_dia enable row level security;
