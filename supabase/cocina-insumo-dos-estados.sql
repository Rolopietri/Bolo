-- Cocina · Inventario de dos estados: crudo + procesado (Fases A y B)
-- ════════════════════════════════════════════════════════════════════
-- Modelo nuevo: cada insumo que SE PROCESA distingue dos estados físicos:
--   • crudo      → lo que compraste, aún sin procesar  (columna `stock_actual`)
--   • procesado  → lo que ya está listo para vender     (columna `stock_procesado`)
-- Total físico = crudo + procesado (suma simple, es lo que físicamente tienes).
--
-- Fase A (este bloque de columnas): el insumo gana dos campos nuevos sin tocar
-- NADA de lo existente. `stock_actual` sigue siendo el crudo (= el stock de hoy),
-- así la lógica de 3 capas (comprometido/libre, alertas, pedidos) no cambia.
-- `stock_procesado` arranca en 0 y solo lo mueve el evento de procesamiento (B).
--
-- Fase B (la función `registrar_procesamiento`): registra "procesé X crudo →
-- obtuve Y procesado". Baja el crudo, sube el procesado y deja la merma (X−Y)
-- en el libro de movimientos como una merma (motivo 'Procesamiento'), para que
-- se refleje en el registro de mermas tal como funciona hoy.
--
-- Todo es ADITIVO e idempotente. No borra ni pierde datos. La RLS de `insumos`
-- y `stock_movimientos` ya existe y aplica igual a las columnas/filas nuevas.

-- ─── Fase A · columnas nuevas ──────────────────────────────────────────
alter table public.insumos
  add column if not exists se_procesa boolean not null default false;

alter table public.insumos
  add column if not exists stock_procesado numeric not null default 0;

comment on column public.insumos.se_procesa is
  'true = el insumo se procesa (distingue crudo/procesado). Lo marca el usuario.';
comment on column public.insumos.stock_procesado is
  'Stock YA PROCESADO (listo para vender), en unidad_base. El crudo vive en stock_actual. Total físico = stock_actual + stock_procesado.';

-- stock_procesado nunca negativo (idempotente: solo agrega la constraint si falta).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'insumos_stock_procesado_no_negativo'
  ) then
    alter table public.insumos
      add constraint insumos_stock_procesado_no_negativo
      check (stock_procesado >= 0);
  end if;
end $$;

-- ─── Fase B · evento de procesamiento (atómico) ────────────────────────
-- Baja `stock_actual` (crudo) en p_crudo y sube `stock_procesado` en p_procesado,
-- bajo lock de fila (mismo patrón atómico que registrar_perdida_stock). La merma
-- del lote (p_crudo − p_procesado) se registra como un movimiento tipo 'merma'
-- con motivo 'Procesamiento', capa 'total', en NEGATIVO — así aparece en el
-- registro de mermas igual que una pérdida. security invoker → respeta la RLS.
create or replace function public.registrar_procesamiento(
  p_insumo_id uuid,
  p_crudo numeric,           -- crudo consumido (positivo)
  p_procesado numeric,       -- procesado obtenido (positivo)
  p_fecha date default null,
  p_nota text default null
)
returns table (
  insumo_id uuid,
  stock_crudo numeric,       -- nuevo crudo (stock_actual)
  stock_procesado numeric,   -- nuevo procesado
  merma numeric,             -- p_crudo − p_procesado
  movimiento_id uuid
)
language plpgsql
security invoker
set search_path = public
as $$
-- `stock_procesado` es a la vez columna de la tabla y nombre de salida de la
-- función; sin esto, el UPDATE/RETURNING da "column reference is ambiguous".
-- (La versión canónica y completa vive en cocina-procesamientos.sql.)
#variable_conflict use_column
declare
  v_crudo_nuevo numeric;
  v_proc_nuevo  numeric;
  v_merma       numeric;
  v_mov_id      uuid;
  v_crudo_actual numeric;
begin
  if p_crudo is null or p_crudo <= 0 then
    raise exception 'El crudo procesado debe ser mayor a 0.';
  end if;
  if p_procesado is null or p_procesado < 0 then
    raise exception 'El procesado obtenido no puede ser negativo.';
  end if;

  -- Candado de fila + validar que haya crudo suficiente.
  select coalesce(stock_actual, 0) into v_crudo_actual
    from public.insumos where id = p_insumo_id for update;
  if not found then
    raise exception 'Insumo no encontrado';
  end if;
  if p_crudo > v_crudo_actual + 0.00005 then
    raise exception 'No hay suficiente crudo: tienes % y quieres procesar %.',
      v_crudo_actual, p_crudo;
  end if;

  v_merma := p_crudo - p_procesado;

  update public.insumos
     set stock_actual     = greatest(0, coalesce(stock_actual, 0) - p_crudo),
         stock_procesado  = coalesce(stock_procesado, 0) + p_procesado
   where id = p_insumo_id
   returning stock_actual, stock_procesado into v_crudo_nuevo, v_proc_nuevo;

  -- La merma del lote (lo que se perdió al procesar) queda en el libro como
  -- merma, en negativo, para que aparezca en el registro de mermas. Si no hubo
  -- merma (merma = 0) no se registra movimiento.
  if v_merma <> 0 then
    insert into public.stock_movimientos
      (insumo_id, tipo, capa, cantidad, motivo, fecha, nota)
    values
      (p_insumo_id, 'merma', 'total', -v_merma, 'Procesamiento',
       coalesce(p_fecha, current_date), p_nota)
    returning id into v_mov_id;
  end if;

  return query select p_insumo_id, v_crudo_nuevo, v_proc_nuevo, v_merma, v_mov_id;
end;
$$;
