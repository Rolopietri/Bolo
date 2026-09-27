-- ============================================================
-- Frescura del precio de costeo (Opción A)
-- ------------------------------------------------------------
-- En Venezuela los precios cambian rápido, así que un precio de hace semanas
-- ya no sirve para costear. Esta migración:
--   1. Agrega la columna `precio_actualizado` a insumos = última vez que el
--      precio se confirmó (por una compra o por un refresco manual).
--   2. Actualiza el trigger de compras para que estampe esa fecha.
--   3. Rellena la columna en insumos existentes con su última fecha de compra,
--      para que la frescura funcione de inmediato con los datos históricos.
--
-- La definición del trigger es IDÉNTICA a la de `cocina.sql` (donde vive junto
-- a su `create trigger`). Se repite aquí solo para poder aplicar el cambio
-- sobre una base ya existente sin re-correr todo el esquema. Si cambias la
-- lógica del trigger, cámbiala en AMBOS archivos.
-- ============================================================

-- 1. Columna nueva (idempotente)
alter table public.insumos
  add column if not exists precio_actualizado date;

-- 2. Trigger actualizado (misma lógica que cocina.sql + estampa precio_actualizado)
create or replace function public.apply_compra_to_insumo()
returns trigger language plpgsql as $$
declare
  v_unidad_base text;
  v_cantidad_por_compra numeric;
  v_stock_add numeric;
  v_precio_compra_unit numeric;
begin
  -- Traer unidad_base y cantidad_por_compra del insumo
  select unidad_base, cantidad_por_compra into v_unidad_base, v_cantidad_por_compra
  from public.insumos where id = new.insumo_id;

  -- Sumar al stock (cantidad comprada × cantidad_por_compra)
  v_stock_add := new.cantidad * coalesce(v_cantidad_por_compra, 1);

  -- Precio unitario de esta compra
  if new.cantidad > 0 then
    v_precio_compra_unit := new.precio_total_usd / new.cantidad;
  else
    v_precio_compra_unit := new.precio_total_usd;
  end if;

  -- Rotar última → penúltima, y registrar nueva
  update public.insumos set
    stock_actual = coalesce(stock_actual, 0) + v_stock_add,

    penultima_fecha = ultima_fecha,
    penultima_cantidad = ultima_cantidad,
    penultima_precio_usd = ultima_precio_usd,
    penultima_precio_bs = ultima_precio_bs,

    ultima_fecha = new.fecha,
    ultima_cantidad = new.cantidad,
    ultima_precio_usd = v_precio_compra_unit,
    ultima_precio_bs = case
      when new.cantidad > 0 and new.precio_total_bs is not null
        then new.precio_total_bs / new.cantidad
      else null
    end,

    precio_compra_usd = v_precio_compra_unit,
    precio_base_usd = case
      when v_cantidad_por_compra > 0 then v_precio_compra_unit / v_cantidad_por_compra
      else v_precio_compra_unit
    end,
    -- El precio queda "fresco" a la fecha de la compra (frescura del costeo)
    precio_actualizado = new.fecha,

    proveedor_id = coalesce(new.proveedor_id, proveedor_id)
  where id = new.insumo_id;

  return new;
end;
$$;

drop trigger if exists compra_apply_to_insumo on public.compras;
create trigger compra_apply_to_insumo
  after insert on public.compras
  for each row execute function public.apply_compra_to_insumo();

-- 3. Relleno de datos existentes: el precio actual viene de la última compra,
--    así que su frescura arranca desde esa fecha.
update public.insumos
  set precio_actualizado = ultima_fecha
  where precio_actualizado is null
    and ultima_fecha is not null;
