-- Cocina · Descuento/reposición de stock por pérdida de forma ATÓMICA
-- ════════════════════════════════════════════════════════════════
-- Antes, `registrarPerdida` y `deleteMovimiento(devolverStock)` hacían un
-- read-modify-write DESDE EL CLIENTE: SELECT stock_actual → restar en JS →
-- UPDATE con el valor absoluto. Si entre el SELECT y el UPDATE ocurría otro
-- cambio (ej. un import de Xetux que baja el stock por trigger, otra pérdida,
-- o una compra), ese cambio se PERDÍA (lost update): el UPDATE con valor
-- absoluto pisaba lo que había pasado en el medio.
--
-- Estas dos funciones hacen el ajuste DENTRO de Postgres, con el patrón atómico
-- `stock_actual = stock_actual - x` bajo lock de fila (igual que los triggers de
-- venta/compra). Además insertan/borran el movimiento en la MISMA transacción,
-- así nunca queda un movimiento huérfano si el ajuste de stock falla.
--
-- security invoker → respetan la RLS del usuario (mismos permisos que hoy).
-- Idempotente (create or replace).

-- ─── Registrar una pérdida/merma (capa 'total') ─────────────────────────
create or replace function public.registrar_perdida_stock(
  p_insumo_id uuid,
  p_tipo text,
  p_cantidad numeric,        -- POSITIVA: magnitud de la pérdida
  p_motivo text default null,
  p_fecha date default null,
  p_nota text default null
)
returns table (
  id uuid,
  insumo_id uuid,
  tipo text,
  capa text,
  cantidad numeric,
  motivo text,
  fecha date,
  nota text,
  created_at timestamptz,
  stock_nuevo numeric
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_nuevo numeric;
  v_mov public.stock_movimientos%rowtype;
begin
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad debe ser mayor a 0.';
  end if;

  -- Descuento ATÓMICO (bajo lock de fila). Nunca lee-modifica-escribe en cliente.
  update public.insumos
     set stock_actual = greatest(0, coalesce(stock_actual, 0) - p_cantidad)
   where insumos.id = p_insumo_id
   returning stock_actual into v_nuevo;
  if not found then
    raise exception 'Insumo no encontrado';
  end if;

  -- El movimiento se guarda en NEGATIVO (capa 'total'), en la misma transacción.
  insert into public.stock_movimientos
    (insumo_id, tipo, capa, cantidad, motivo, fecha, nota)
  values
    (p_insumo_id, p_tipo, 'total', -abs(p_cantidad), p_motivo,
     coalesce(p_fecha, current_date), p_nota)
  returning * into v_mov;

  return query
    select v_mov.id, v_mov.insumo_id, v_mov.tipo, v_mov.capa, v_mov.cantidad,
           v_mov.motivo, v_mov.fecha, v_mov.nota, v_mov.created_at, v_nuevo;
end;
$$;

-- ─── Borrar un movimiento, opcionalmente devolviendo el stock ───────────
-- p_devolver = true  → repone al stock físico (solo capa 'total') y borra.
-- p_devolver = false → solo borra el movimiento, sin tocar el stock.
-- Devuelve el nuevo stock físico si hubo reposición, o NULL si no.
create or replace function public.borrar_movimiento_stock(
  p_id uuid,
  p_devolver boolean default false
)
returns numeric
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_insumo uuid;
  v_capa   text;
  v_cant   numeric;
  v_nuevo  numeric := null;
begin
  select insumo_id, capa, cantidad
    into v_insumo, v_capa, v_cant
    from public.stock_movimientos
   where id = p_id;
  if not found then
    raise exception 'Movimiento no encontrado';
  end if;

  -- Revertir = deshacer el delta. Como la pérdida se guardó en negativo,
  -- restar la cantidad (negativa) la SUMA de vuelta al stock. Atómico.
  if p_devolver and v_capa = 'total' and coalesce(v_cant, 0) <> 0 then
    update public.insumos
       set stock_actual = greatest(0, coalesce(stock_actual, 0) - v_cant)
     where id = v_insumo
     returning stock_actual into v_nuevo;
  end if;

  delete from public.stock_movimientos where id = p_id;
  return v_nuevo;
end;
$$;
