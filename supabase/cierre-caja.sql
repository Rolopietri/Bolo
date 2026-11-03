-- Cierre de caja diario.
-- Un cierre por fecha, editable. Cada método guarda el monto en su moneda
-- original y el equivalente en USD con la tasa BCV de esa fecha (tasa_usd_bs,
-- y tasa_fecha por si se usó la última tasa conocida anterior).
--
--   efectivo_usd, zelle          → USD
--   efectivo_bs, pago_movil, punto → Bs
--   otro                         → USD o Bs
--
-- La comparación contra las ventas no se guarda: se calcula con public.ventas
-- de ese día, sin mermas. Un solo local, compartido por quien tenga sesión.

create table if not exists public.cierre_caja (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  nota text,
  tasa_usd_bs numeric(18, 6),
  tasa_fecha date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  constraint cierre_caja_fecha_unica unique (fecha),
  constraint cierre_caja_tasa_ok check (tasa_usd_bs is null or tasa_usd_bs > 0),
  constraint cierre_caja_nota_ok check (nota is null or char_length(nota) <= 500)
);

create table if not exists public.cierre_caja_linea (
  id uuid primary key default gen_random_uuid(),
  cierre_id uuid not null references public.cierre_caja (id) on delete cascade,
  metodo text not null,
  etiqueta text,
  moneda text not null,
  monto numeric(14, 2) not null,
  monto_usd numeric(14, 4),
  constraint cierre_caja_linea_metodo_unica unique (cierre_id, metodo),
  constraint cierre_caja_linea_metodo_ok check (
    metodo in ('efectivo_usd', 'efectivo_bs', 'pago_movil', 'punto', 'zelle', 'otro')
  ),
  constraint cierre_caja_linea_moneda_ok check (moneda in ('USD', 'Bs')),
  constraint cierre_caja_linea_monto_ok check (monto >= 0),
  constraint cierre_caja_linea_usd_ok check (monto_usd is null or monto_usd >= 0),
  constraint cierre_caja_linea_etiqueta_ok check (etiqueta is null or char_length(etiqueta) <= 80),
  constraint cierre_caja_linea_moneda_metodo_ok check (
    (metodo in ('efectivo_usd', 'zelle') and moneda = 'USD')
    or (metodo in ('efectivo_bs', 'pago_movil', 'punto') and moneda = 'Bs')
    or (metodo = 'otro' and moneda in ('USD', 'Bs'))
  )
);

create index if not exists idx_cierre_caja_fecha on public.cierre_caja (fecha desc);
create index if not exists idx_cierre_caja_linea_cierre on public.cierre_caja_linea (cierre_id);

alter table public.cierre_caja enable row level security;
alter table public.cierre_caja_linea enable row level security;

revoke all on table public.cierre_caja from anon, authenticated;
revoke all on table public.cierre_caja_linea from anon, authenticated;
grant select, insert, update, delete on table public.cierre_caja to authenticated;
grant select, insert, update, delete on table public.cierre_caja_linea to authenticated;

drop policy if exists "cierre_caja_select" on public.cierre_caja;
create policy "cierre_caja_select" on public.cierre_caja
  for select to authenticated using (true);

drop policy if exists "cierre_caja_insert" on public.cierre_caja;
create policy "cierre_caja_insert" on public.cierre_caja
  for insert to authenticated with check (true);

drop policy if exists "cierre_caja_update" on public.cierre_caja;
create policy "cierre_caja_update" on public.cierre_caja
  for update to authenticated using (true) with check (true);

drop policy if exists "cierre_caja_delete" on public.cierre_caja;
create policy "cierre_caja_delete" on public.cierre_caja
  for delete to authenticated using (true);

drop policy if exists "cierre_caja_linea_select" on public.cierre_caja_linea;
create policy "cierre_caja_linea_select" on public.cierre_caja_linea
  for select to authenticated using (true);

drop policy if exists "cierre_caja_linea_insert" on public.cierre_caja_linea;
create policy "cierre_caja_linea_insert" on public.cierre_caja_linea
  for insert to authenticated with check (true);

drop policy if exists "cierre_caja_linea_update" on public.cierre_caja_linea;
create policy "cierre_caja_linea_update" on public.cierre_caja_linea
  for update to authenticated using (true) with check (true);

drop policy if exists "cierre_caja_linea_delete" on public.cierre_caja_linea;
create policy "cierre_caja_linea_delete" on public.cierre_caja_linea
  for delete to authenticated using (true);
