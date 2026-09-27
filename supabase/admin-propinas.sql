-- Administración · Propinas (tips)
-- La propina NO es ingreso, pero se registra aparte para saber cuánto entró.
-- Se llena al importar Setux (una fila por día/reporte). Tabla CERRADA (RLS).
create table if not exists public.admin_propina (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  monto numeric(16,2),          -- total de propina del reporte (moneda EUR)
  moneda text default 'EUR',
  fuente text,                  -- 'setux'
  nota text,
  created_at timestamptz not null default now()
);
create index if not exists idx_admin_propina_fecha on public.admin_propina (fecha);
create index if not exists idx_admin_propina_fuente on public.admin_propina (fuente, fecha);
alter table public.admin_propina enable row level security;
