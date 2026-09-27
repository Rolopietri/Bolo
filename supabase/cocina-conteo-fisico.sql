-- Conteo físico (reconciliación de inventario).
-- Setea el stock_actual de un insumo a un valor ABSOLUTO (lo que se contó
-- físicamente) y registra el ajuste en el libro de movimientos. Atómico y con
-- lock de fila para no perder cambios concurrentes (ventas/compras entre medias).
--
-- Es distinto de registrar_perdida_stock (que RESTA una cantidad relativa):
-- aquí el usuario dice "tengo 47 de esto" y el sistema calcula la diferencia.
--
-- Aditivo e idempotente.
create or replace function public.ajustar_stock_conteo(
  p_insumo_id uuid,
  p_nuevo numeric,
  p_nota text default null
) returns numeric
language plpgsql
security invoker
as $$
declare
  v_viejo numeric;
  v_delta numeric;
begin
  if p_nuevo is null or p_nuevo < 0 then
    raise exception 'El conteo debe ser un número mayor o igual a 0';
  end if;

  select stock_actual into v_viejo
    from public.insumos where id = p_insumo_id
    for update;
  if not found then
    raise exception 'Insumo no encontrado';
  end if;

  v_delta := p_nuevo - coalesce(v_viejo, 0);
  if v_delta = 0 then
    return p_nuevo;  -- sin cambios: no ensucia el historial
  end if;

  update public.insumos set stock_actual = p_nuevo where id = p_insumo_id;

  insert into public.stock_movimientos
    (insumo_id, tipo, capa, cantidad, motivo, fecha, nota)
  values
    (p_insumo_id, 'ajuste', 'total', v_delta, 'Conteo físico', current_date,
     nullif(btrim(coalesce(p_nota, '')), ''));

  return p_nuevo;
end;
$$;
