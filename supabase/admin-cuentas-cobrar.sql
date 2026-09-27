-- Administración · Cuentas por cobrar (CXC)
-- Lo que en Setux entra como "CXC" son ventas a crédito: NO son ingreso
-- todavía. Se guardan aquí como cuentas abiertas, salen como alerta en el
-- panel, y al marcarlas "cobrada" se convierten en ingreso.
-- Tabla CERRADA (RLS activo sin políticas): solo el servidor de admin.

create table if not exists public.admin_cuenta_cobrar (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,   -- fecha de origen (reporte)
  descripcion text,
  deudor text,                                -- opcional: quién debe
  monto numeric(16,2),                        -- en la moneda de origen (EUR de Setux)
  moneda text default 'EUR',
  tasa numeric(16,4),                         -- €→USD al importar (opcional)
  monto_usd numeric(16,2),                    -- equivalente calculado
  cobrada boolean not null default false,
  fecha_cobro date,
  ingreso_id uuid references public.admin_ingreso(id) on delete set null,
  fuente text,                                -- 'setux' si vino del import
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_admin_cxc_abierta on public.admin_cuenta_cobrar (cobrada, fecha);
create index if not exists idx_admin_cxc_fuente on public.admin_cuenta_cobrar (fuente, fecha);

alter table public.admin_cuenta_cobrar enable row level security;

drop trigger if exists admin_cxc_set_updated on public.admin_cuenta_cobrar;
create trigger admin_cxc_set_updated
  before update on public.admin_cuenta_cobrar
  for each row execute function public.set_updated_at();
