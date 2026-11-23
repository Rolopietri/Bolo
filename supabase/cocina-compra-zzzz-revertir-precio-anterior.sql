-- ═══════════════════════════════════════════════════════════════════
-- BOLO-10 · Al borrar una compra, el precio vuelve a la que sigue viva
-- ═══════════════════════════════════════════════════════════════════
-- El nombre NO es bolo-10-*.sql a propósito. bolo-10 ordenaría ANTES de
-- cocina-compra-snapshot-factor.sql, y al reaplicar los SQL en orden
-- alfabético esa versión (caché de dos precios) pisaría este arreglo.
-- "zzzz" hace que este archivo quede después de snapshot-factor y gane.
--
-- La versión de snapshot-factor, al borrar:
--   • Resta el stock con el factor congelado (cantidad_por_compra_snap).
--     Eso se mantiene.
--   • El precio solo se toca si la fila coincide con ultima_fecha y
--     ultima_cantidad. Si coincide, rota a la penúltima y BORRA la
--     penúltima. Una tercera compra ya no está en el caché. Borrar la
--     última y luego la que queda deja precio_base_usd y
--     precio_compra_usd en NULL aunque siga habiendo una compra más
--     vieja. Las recetas que costean con precio_base_usd quedan sin costo.
--
-- Aquí, después de restar el stock, se reconstruyen ultima/penultima y
-- los precios desde las compras que SIGUEN en la tabla (orden: fecha,
-- created_at, id). Si no queda ninguna, los precios quedan en NULL.
-- Si queda alguna, el precio es el de la más reciente que sigue viva,
-- con el factor congelado de ESA compra.
--
-- Depende de la columna compras.cantidad_por_compra_snap
-- (cocina-compra-snapshot-factor.sql). Correr este archivo después.
--
-- Idempotente (CREATE OR REPLACE + drop/create del trigger).

create or replace function public.revertir_compra_de_insumo()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_factor_vivo numeric;
  v_stock_sub numeric;
  v_ult public.compras%rowtype;
  v_pen public.compras%rowtype;
  v_hay_ult boolean := false;
  v_hay_pen boolean := false;
  v_factor numeric;
  v_ult_unit numeric;
  v_pen_unit numeric;
begin
  -- Motivo del libro de stock (bolo-04). CREATE OR REPLACE borra el
  -- set_config que bolo-04 inyecta, así que va en el cuerpo.
  perform set_config('bolo.motivo', 'compra_revertida', true);

  select cantidad_por_compra into v_factor_vivo
    from public.insumos where id = old.insumo_id;

  v_stock_sub := old.cantidad
    * coalesce(old.cantidad_por_compra_snap, v_factor_vivo, 1);

  -- Este AFTER DELETE ya no ve la fila old.
  select * into v_ult
    from public.compras c
   where c.insumo_id = old.insumo_id
   order by c.fecha desc, c.created_at desc, c.id desc
   limit 1;
  v_hay_ult := found;

  if v_hay_ult then
    select * into v_pen
      from public.compras c
     where c.insumo_id = old.insumo_id
       and c.id <> v_ult.id
     order by c.fecha desc, c.created_at desc, c.id desc
     limit 1;
    v_hay_pen := found;
  end if;

  if not v_hay_ult then
    update public.insumos set
      stock_actual = greatest(0, coalesce(stock_actual, 0) - v_stock_sub),
      ultima_fecha = null,
      ultima_cantidad = null,
      ultima_precio_usd = null,
      ultima_precio_bs = null,
      precio_compra_usd = null,
      precio_base_usd = null,
      precio_actualizado = null,
      penultima_fecha = null,
      penultima_cantidad = null,
      penultima_precio_usd = null,
      penultima_precio_bs = null
    where id = old.insumo_id;
  else
    v_factor := coalesce(v_ult.cantidad_por_compra_snap, v_factor_vivo, 1);
    v_ult_unit := case
      when v_ult.cantidad > 0 then v_ult.precio_total_usd / v_ult.cantidad
      else v_ult.precio_total_usd
    end;
    if v_hay_pen then
      v_pen_unit := case
        when v_pen.cantidad > 0 then v_pen.precio_total_usd / v_pen.cantidad
        else v_pen.precio_total_usd
      end;
    end if;

    update public.insumos set
      stock_actual = greatest(0, coalesce(stock_actual, 0) - v_stock_sub),
      ultima_fecha = v_ult.fecha,
      ultima_cantidad = v_ult.cantidad,
      ultima_precio_usd = v_ult_unit,
      ultima_precio_bs = case
        when v_ult.cantidad > 0 and v_ult.precio_total_bs is not null
          then v_ult.precio_total_bs / v_ult.cantidad
        else null
      end,
      precio_compra_usd = v_ult_unit,
      precio_base_usd = case
        when v_factor > 0 then v_ult_unit / v_factor
        else v_ult_unit
      end,
      precio_actualizado = v_ult.fecha,
      penultima_fecha = case when v_hay_pen then v_pen.fecha else null end,
      penultima_cantidad = case when v_hay_pen then v_pen.cantidad else null end,
      penultima_precio_usd = case when v_hay_pen then v_pen_unit else null end,
      penultima_precio_bs = case
        when not v_hay_pen then null
        when v_pen.cantidad > 0 and v_pen.precio_total_bs is not null
          then v_pen.precio_total_bs / v_pen.cantidad
        else null
      end
    where id = old.insumo_id;
  end if;

  return old;
end;
$$;

drop trigger if exists compra_revert_from_insumo on public.compras;
create trigger compra_revert_from_insumo
  after delete on public.compras
  for each row execute function public.revertir_compra_de_insumo();

notify pgrst, 'reload schema';
