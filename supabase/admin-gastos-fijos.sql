-- Administración · Gastos fijos
--
-- Tabla nueva, aparte de admin_egreso. El egreso es un pago de un día
-- (caja). El gasto fijo es el compromiso que se descuenta de la utilidad:
-- alquiler, nómina, servicios, gas u otro. Puede repetirse cada mes desde
-- una fecha, sin volver a cargarlo.
--
-- No se mezcla con el egreso para no contar dos veces. Si en un mes ya hay
-- un egreso clasificado como fijo de la misma categoría, las pantallas usan
-- el gasto fijo y dejan fuera ese egreso. Un egreso variable (el gas de un
-- día) sigue en la caja.
--
-- La semana prorratea el monto mensual por los días que caen en el mes
-- (monto × días ÷ días del mes). El mes completo descuenta el monto entero.
-- El equivalente en dólares se guarda al registrar (Bs ÷ tasa BCV de la fecha).
--
-- RLS para authenticated: quien ya inició sesión en bolo puede ver y anotar.
-- Idempotente: se puede correr varias veces. No borra filas.

create table if not exists public.admin_gasto_fijo (
  id uuid primary key default gen_random_uuid(),
  categoria text not null,
  monto numeric(16, 2) not null,
  moneda text not null default 'USD',
  tasa numeric(16, 4),
  monto_usd numeric(16, 2) not null,
  fecha date not null,
  nota text,
  recurrente boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_gasto_fijo_categoria_ok check (
    categoria in ('alquiler', 'nomina', 'servicios', 'gas', 'otro')
  ),
  constraint admin_gasto_fijo_moneda_ok check (moneda in ('USD', 'Bs')),
  constraint admin_gasto_fijo_monto_ok check (monto >= 0),
  constraint admin_gasto_fijo_usd_ok check (monto_usd >= 0),
  constraint admin_gasto_fijo_tasa_ok check (tasa is null or tasa > 0),
  constraint admin_gasto_fijo_nota_ok check (nota is null or char_length(nota) <= 500)
);

create index if not exists idx_admin_gasto_fijo_fecha on public.admin_gasto_fijo (fecha);

alter table public.admin_gasto_fijo enable row level security;

revoke all on table public.admin_gasto_fijo from anon, authenticated;
grant select, insert, update, delete on table public.admin_gasto_fijo to authenticated;

drop policy if exists "admin_gasto_fijo_select" on public.admin_gasto_fijo;
create policy "admin_gasto_fijo_select" on public.admin_gasto_fijo
  for select to authenticated using (true);

drop policy if exists "admin_gasto_fijo_insert" on public.admin_gasto_fijo;
create policy "admin_gasto_fijo_insert" on public.admin_gasto_fijo
  for insert to authenticated with check (true);

drop policy if exists "admin_gasto_fijo_update" on public.admin_gasto_fijo;
create policy "admin_gasto_fijo_update" on public.admin_gasto_fijo
  for update to authenticated using (true) with check (true);

drop policy if exists "admin_gasto_fijo_delete" on public.admin_gasto_fijo;
create policy "admin_gasto_fijo_delete" on public.admin_gasto_fijo
  for delete to authenticated using (true);

drop trigger if exists admin_gasto_fijo_set_updated on public.admin_gasto_fijo;
create trigger admin_gasto_fijo_set_updated
  before update on public.admin_gasto_fijo
  for each row execute function public.set_updated_at();
