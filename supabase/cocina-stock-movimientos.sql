-- Cocina · Stock movimientos (M5 – libro de movimientos de inventario)
-- Tabla append-only que registra cada cambio en el stock de un insumo, con tipo
-- (perdida, mal_estado, merma, vencimiento, otro, ajuste, compra_recibida,
-- venta, comprometido_in, comprometido_out, plan_completado) y la capa
-- afectada (total o comprometido).
--
-- Diseñada para soportar el refactor a 3 capas (stockTotal / stockComprometido /
-- stockLibre) sin migración futura — por ahora solo usamos 'total' para
-- pérdida/merma; las otras capas se activan en sub-tareas futuras.
--
-- Aditivo, idempotente — corre seguro varias veces.

create table if not exists public.stock_movimientos (
  id uuid primary key default gen_random_uuid(),
  insumo_id uuid not null references public.insumos(id) on delete cascade,

  -- Tipo de movimiento. Texto libre para no atarse a un enum (más flexible).
  -- Valores canónicos:
  --   perdida | mal_estado | merma | vencimiento | otro
  --   ajuste            (corrección manual del stock)
  --   compra_recibida   (entrada por pedido)
  --   venta             (salida por Xetux)
  --   comprometido_in   (reserva por plan de producción)
  --   comprometido_out  (libera reserva: completado o cancelado)
  --   plan_completado   (la producción se hizo, salen ingredientes del total)
  tipo text not null,

  -- Capa afectada: 'total' (físico) o 'comprometido' (reservado).
  capa text not null default 'total',

  -- Cantidad en unidad_base del insumo. Positivo = entra, negativo = sale.
  -- (Para pérdidas/mermas guardamos cantidad negativa.)
  cantidad numeric(12, 4) not null,

  -- Para movimientos manuales (pérdida/merma/ajuste): motivo opcional libre.
  -- Útil para reportes y trazabilidad.
  motivo text,

  -- Fecha del movimiento (puede ser distinta de created_at si se registra ex-post).
  fecha date not null default current_date,

  nota text,

  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_smov_insumo on public.stock_movimientos(insumo_id);
create index if not exists idx_smov_fecha on public.stock_movimientos(fecha desc);
create index if not exists idx_smov_tipo on public.stock_movimientos(tipo);

alter table public.stock_movimientos enable row level security;

drop policy if exists "smov_select" on public.stock_movimientos;
create policy "smov_select" on public.stock_movimientos
  for select to authenticated using (true);

drop policy if exists "smov_insert" on public.stock_movimientos;
create policy "smov_insert" on public.stock_movimientos
  for insert to authenticated with check (true);

drop policy if exists "smov_update" on public.stock_movimientos;
create policy "smov_update" on public.stock_movimientos
  for update to authenticated using (true) with check (true);

drop policy if exists "smov_delete" on public.stock_movimientos;
create policy "smov_delete" on public.stock_movimientos
  for delete to authenticated using (true);
