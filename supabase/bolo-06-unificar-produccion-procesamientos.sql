-- ═══════════════════════════════════════════════════════════════════
-- BOLO-06 · Unificar Producción y Procesamientos en una sola tabla
-- ═══════════════════════════════════════════════════════════════════
-- Antes había dos caminos que medían LO MISMO (cuánto entró sin procesar,
-- cuánto quedó útil, cuánta merma):
--   • El botón "Procesar" → tabla `procesamientos` (doble estado crudo/
--     procesado, alimenta las alertas de merma).
--   • El módulo "Producción" → tabla `produccion_lotes` (solo descontaba la
--     merma; no movía el procesado ni alimentaba las alertas).
--
-- A partir de aquí `procesamientos` es la ÚNICA fuente. Para que el módulo de
-- Producción pueda escribir ahí sin perder lo suyo, `procesamientos` gana dos
-- campos que solo tenía Producción: `responsable` y `origen`.
--
-- Aditivo e idempotente. No borra datos. `produccion_lotes` queda sin uso
-- (se retira en un paso aparte, con autorización).

-- ─── Columnas nuevas en procesamientos ─────────────────────────────────
alter table public.procesamientos
  add column if not exists responsable text;

alter table public.procesamientos
  add column if not exists origen text not null default 'manual';

-- origen solo puede ser manual / escaneo / telegram (idempotente).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'procesamientos_origen_valido'
  ) then
    alter table public.procesamientos
      add constraint procesamientos_origen_valido
      check (origen in ('manual', 'escaneo', 'telegram'));
  end if;
end $$;

comment on column public.procesamientos.responsable is
  'Quién hizo el procesamiento (opcional). Viene del módulo de Producción.';
comment on column public.procesamientos.origen is
  'Cómo se registró: manual (en la app), escaneo (plantilla impresa) o telegram.';

-- ─── registrar_procesamiento: ahora guarda responsable y origen ────────
-- Mismo contrato de retorno y misma lógica de stock/merma; solo suma dos
-- parámetros nuevos (con valor por defecto, para no romper a quien ya la
-- llama, como el botón "Procesar").
--
-- Se elimina primero la versión de 5 parámetros: al sumar parámetros, Postgres
-- crearía una SOBRECARGA nueva y dejaría la vieja, y PostgREST no sabría cuál
-- usar. Dropear y recrear deja una sola versión.
drop function if exists public.registrar_procesamiento(uuid, numeric, numeric, date, text);

create or replace function public.registrar_procesamiento(
  p_insumo_id uuid,
  p_crudo numeric,
  p_procesado numeric,
  p_fecha date default null,
  p_nota text default null,
  p_responsable text default null,
  p_origen text default 'manual'
)
returns table (
  insumo_id uuid,
  stock_crudo numeric,
  stock_procesado numeric,
  merma numeric,
  movimiento_id uuid
)
language plpgsql
security invoker
set search_path = public
as $$
-- `stock_procesado` es a la vez columna de la tabla y nombre de salida de la
-- función; sin esto, el UPDATE/RETURNING da "column reference is ambiguous".
#variable_conflict use_column
declare
  v_crudo_nuevo numeric;
  v_proc_nuevo  numeric;
  v_merma       numeric;
  v_mov_id      uuid;
  v_crudo_actual numeric;
  v_origen      text;
begin
  if p_crudo is null or p_crudo <= 0 then
    raise exception 'El crudo procesado debe ser mayor a 0.';
  end if;
  if p_procesado is null or p_procesado < 0 then
    raise exception 'El procesado obtenido no puede ser negativo.';
  end if;

  v_origen := coalesce(p_origen, 'manual');
  if v_origen not in ('manual', 'escaneo', 'telegram') then
    v_origen := 'manual';
  end if;

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

  if v_merma <> 0 then
    insert into public.stock_movimientos
      (insumo_id, tipo, capa, cantidad, motivo, fecha, nota)
    values
      (p_insumo_id, 'merma', 'total', -v_merma, 'Procesamiento',
       coalesce(p_fecha, current_date), p_nota)
    returning id into v_mov_id;
  end if;

  -- Historial estructurado para las alertas de merma, ahora con responsable y origen.
  insert into public.procesamientos
    (insumo_id, fecha, crudo, procesado, merma_porc, nota, responsable, origen, created_by)
  values (
    p_insumo_id, coalesce(p_fecha, current_date), p_crudo, p_procesado,
    case when p_crudo > 0 then (p_crudo - p_procesado) / p_crudo * 100 else 0 end,
    p_nota, nullif(btrim(coalesce(p_responsable, '')), ''), v_origen, auth.uid()
  );

  return query select p_insumo_id, v_crudo_nuevo, v_proc_nuevo, v_merma, v_mov_id;
end;
$$;

-- Que PostgREST reconozca enseguida la firma nueva de la función.
notify pgrst, 'reload schema';
