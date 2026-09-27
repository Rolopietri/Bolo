-- Administración · Cuentas por cobrar v2 (por cliente, con detalle y pagos)
-- Objetivo: manejar las CXC como saldos por cliente conservando el detalle de
-- cada deuda (cuenta) y registrando los pagos (cobros) como movimientos aparte.
--   saldo del cliente = Σ cuentas abiertas − Σ pagos
-- NO se borra el detalle al cobrar; el historial se conserva.
-- Todo se maneja como las ventas: monto en su moneda + tasa + equivalente USD.

-- 1) La tabla de cuentas (deudas) ya existe (admin_cuenta_cobrar). Le añadimos
--    referencia del documento de Zetux y un hash para no duplicar al reimportar.
alter table public.admin_cuenta_cobrar add column if not exists ref text;         -- p. ej. NE-8281
alter table public.admin_cuenta_cobrar add column if not exists import_hash text;  -- dedupe reimport

-- Evita importar dos veces la misma cuenta (mismo cliente + referencia).
create unique index if not exists idx_admin_cxc_import_hash
  on public.admin_cuenta_cobrar (import_hash) where import_hash is not null;

-- 2) Pagos (cobros) de cuentas por cobrar. Cada pago:
--    - reduce el saldo del cliente,
--    - queda enlazado al ingreso que genera (ingreso_id) para no duplicar,
--    - guarda el método y la fecha real del cobro.
create table if not exists public.admin_cxc_pago (
  id uuid primary key default gen_random_uuid(),
  cliente text not null,                       -- nombre del cliente (deudor)
  fecha date not null default current_date,    -- fecha REAL del cobro
  monto numeric(16,2) not null,                -- en la moneda del cobro
  moneda text not null default 'EUR',          -- EUR | USD | Bs
  tasa numeric(16,4),                          -- para el equivalente USD
  monto_usd numeric(16,2),                     -- equivalente calculado
  metodo text,                                 -- Efectivo | Pago Móvil | Zelle | ...
  referencia text,                             -- referencia/recibo opcional
  ingreso_id uuid references public.admin_ingreso(id) on delete set null,
  nota text,
  created_at timestamptz not null default now()
);
create index if not exists idx_admin_cxc_pago_cliente on public.admin_cxc_pago (cliente);
create index if not exists idx_admin_cxc_pago_fecha on public.admin_cxc_pago (fecha);

alter table public.admin_cxc_pago enable row level security;  -- CERRADA: solo el servidor de admin

-- 3) Limpieza de las CXC del modelo anterior (montos globales / por-cliente sin
--    detalle). El nuevo flujo las reimporta con detalle por documento, así que
--    borramos SOLO las abiertas importadas sin detalle (import_hash null) para
--    que no se dupliquen. Las cuentas manuales y las ya cobradas se conservan.
delete from public.admin_cuenta_cobrar
  where cobrada = false and import_hash is null and fuente in ('estado-cuenta', 'setux');
