-- Administración · CXC incobrable (write-off / pérdida)
-- Cuando a un cliente no se le puede cobrar una cuenta, se marca como
-- INCOBRABLE: sale del saldo por cobrar y se asume como PÉRDIDA para la empresa
-- (se registra un egreso categoría "Incobrables"). Reversible.
alter table public.admin_cuenta_cobrar
  add column if not exists incobrable boolean not null default false;
alter table public.admin_cuenta_cobrar
  add column if not exists fecha_incobrable date;
-- Egreso (pérdida) generado al marcarla incobrable, para poder revertir.
alter table public.admin_cuenta_cobrar
  add column if not exists incobrable_egreso_id uuid references public.admin_egreso(id) on delete set null;

create index if not exists idx_admin_cxc_incobrable
  on public.admin_cuenta_cobrar (incobrable, fecha);
