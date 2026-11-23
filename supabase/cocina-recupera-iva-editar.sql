-- Editar una compra mueve el stock por la DIFERENCIA.
-- Corre DESPUÉS de cocina-recupera-iva-compras.sql (ordena después en
-- alfabético: "editar" va luego de "compras"). Reemplaza reemplazar_compra
-- y el trigger que vincula el proveedor. No borra filas ni datos.
--
-- Antes: la función borraba la compra y la volvía a insertar. El trigger de
-- borrado hace greatest(0, stock − cantidad entera). Si ya se había consumido
-- parte (stock 2, compra de 5), eso deja el stock en 0 y el insert suma 6:
-- queda 6. Tiene que quedar 3 (2 + (6 − 5)).
--
-- También: el execute queda solo en authenticated, y compra_vincula_proveedor
-- corre al insertar y al cambiar el proveedor. No toca greatest(0, …) del
-- borrado: si el stock puede quedar negativo lo decide el negocio.
--
-- Antes de pegarlo en una base que ya tiene la función, compara:
--
--   select p.proname, pg_get_functiondef(p.oid)
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and p.proname in (
--       'apply_compra_to_insumo',
--       'revertir_compra_de_insumo',
--       'reemplazar_compra',
--       'vincular_proveedor_insumo'
--     );
--
--   select tgname, pg_get_triggerdef(t.oid)
--   from pg_trigger t
--   join pg_class c on c.oid = t.tgrelid
--   join pg_namespace n on n.oid = c.relnamespace
--   where n.nspname = 'public'
--     and c.relname = 'compras'
--     and tgname = 'compra_vincula_proveedor'
--     and not t.tgisinternal;

create or replace function public.reemplazar_compra(
  p_id uuid,
  p_insumo_id uuid,
  p_proveedor_id uuid,
  p_fecha date,
  p_cantidad numeric,
  p_precio_total_usd numeric,
  p_precio_total_bs numeric,
  p_tasa_bcv_usada numeric,
  p_modalidad_pago text,
  p_notas text,
  p_numero_factura text,
  p_flete_usd numeric,
  p_pagada boolean,
  p_fecha_pago date,
  p_base_usd numeric,
  p_iva_usd numeric,
  p_exento_usd numeric,
  p_costo_usd numeric
) returns public.compras
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_old public.compras;
  v_nueva public.compras;
  v_factor_viejo numeric;
  v_factor_nuevo numeric;
  v_stock_viejo numeric;
  v_stock_nuevo numeric;
  v_recupera boolean;
  v_costo numeric;
  v_ids uuid[];
  v_id uuid;
  v_ult public.compras;
  v_monto numeric;
  v_unit numeric;
  v_factor numeric;
begin
  -- Se bloquean la compra y el insumo antes de leer cantidades: dos ediciones
  -- a la vez no calculan la diferencia sobre un stock que ya cambió.
  select * into v_old from public.compras where id = p_id for update;
  if not found then
    raise exception 'No está la compra a editar';
  end if;

  if v_old.insumo_id is distinct from p_insumo_id
     and v_old.insumo_id < p_insumo_id then
    perform 1 from public.insumos where id = v_old.insumo_id for update;
  end if;

  select coalesce(cantidad_por_compra, 1) into v_factor_nuevo
    from public.insumos where id = p_insumo_id for update;
  if v_factor_nuevo is null then
    v_factor_nuevo := 1;
  end if;

  if v_old.insumo_id is distinct from p_insumo_id
     and v_old.insumo_id > p_insumo_id then
    perform 1 from public.insumos where id = v_old.insumo_id for update;
  end if;

  v_factor_viejo := coalesce(v_old.cantidad_por_compra_snap, 1);
  v_stock_viejo := v_old.cantidad * v_factor_viejo;
  -- Mismo insumo: las dos cantidades usan el factor congelado de esa compra.
  -- Si no, un cambio de presentación del insumo movería el stock al guardar
  -- sin tocar la cantidad. Otro insumo sí usa su factor de ahora.
  if v_old.insumo_id = p_insumo_id then
    v_stock_nuevo := p_cantidad * v_factor_viejo;
    v_factor_nuevo := v_factor_viejo;
  else
    v_stock_nuevo := p_cantidad * v_factor_nuevo;
  end if;

  -- Misma regla que compras_fijar_costo_iva (ese trigger solo corre en el
  -- insert). Si ya viene el costo, se respeta. Sin desglose, queda null y el
  -- precio sigue saliendo de precio_total_usd.
  v_costo := p_costo_usd;
  if v_costo is null
     and (p_base_usd is not null or p_iva_usd is not null or p_exento_usd is not null) then
    select recupera_iva_compras into v_recupera
      from public.cocina_config where id = 1;
    if v_recupera is null then
      v_recupera := true;
    end if;
    if v_recupera then
      v_costo := coalesce(p_base_usd, 0) + coalesce(p_exento_usd, 0);
    else
      v_costo := coalesce(p_base_usd, 0) + coalesce(p_iva_usd, 0) + coalesce(p_exento_usd, 0);
    end if;
  end if;

  update public.compras set
    insumo_id = p_insumo_id,
    proveedor_id = p_proveedor_id,
    fecha = p_fecha,
    cantidad = p_cantidad,
    precio_total_usd = p_precio_total_usd,
    precio_total_bs = p_precio_total_bs,
    tasa_bcv_usada = p_tasa_bcv_usada,
    modalidad_pago = p_modalidad_pago,
    notas = p_notas,
    numero_factura = nullif(btrim(p_numero_factura), ''),
    flete_usd = p_flete_usd,
    pagada = coalesce(p_pagada, true),
    fecha_pago = p_fecha_pago,
    base_usd = p_base_usd,
    iva_usd = p_iva_usd,
    exento_usd = p_exento_usd,
    costo_usd = v_costo,
    cantidad_por_compra_snap = v_factor_nuevo
  where id = p_id
  returning * into v_nueva;

  -- El libro de stock (bolo-04) lee este motivo en el update del insumo.
  perform set_config('bolo.motivo', 'compra', true);

  if v_old.insumo_id = p_insumo_id then
    update public.insumos
      set stock_actual = coalesce(stock_actual, 0) + (v_stock_nuevo - v_stock_viejo)
      where id = p_insumo_id;
  else
    update public.insumos
      set stock_actual = coalesce(stock_actual, 0) - v_stock_viejo
      where id = v_old.insumo_id;
    update public.insumos
      set stock_actual = coalesce(stock_actual, 0) + v_stock_nuevo
      where id = p_insumo_id;
  end if;

  -- El precio del insumo es el de su compra más reciente. Editar esa compra
  -- lo actualiza. Editar una anterior no lo cambia, porque la más reciente
  -- sigue siendo otra. No se mueve el stock otra vez.
  v_ids := array[p_insumo_id];
  if v_old.insumo_id is distinct from p_insumo_id then
    v_ids := v_ids || v_old.insumo_id;
  end if;

  foreach v_id in array v_ids loop
    select * into v_ult
      from public.compras
     where insumo_id = v_id
     order by fecha desc, created_at desc, id desc
     limit 1;
    if not found then
      continue;
    end if;

    v_monto := coalesce(v_ult.costo_usd, v_ult.precio_total_usd);
    v_unit := case
      when v_ult.cantidad > 0 then v_monto / v_ult.cantidad
      else v_monto
    end;
    select coalesce(v_ult.cantidad_por_compra_snap, cantidad_por_compra, 1)
      into v_factor
      from public.insumos where id = v_id;

    update public.insumos set
      ultima_fecha = v_ult.fecha,
      ultima_cantidad = v_ult.cantidad,
      ultima_precio_usd = v_unit,
      ultima_precio_bs = case
        when v_ult.cantidad > 0 and v_ult.precio_total_bs is not null
          then v_ult.precio_total_bs / v_ult.cantidad
        else null
      end,
      precio_compra_usd = v_unit,
      precio_base_usd = case
        when v_factor > 0 then v_unit / v_factor
        else v_unit
      end,
      precio_actualizado = v_ult.fecha,
      proveedor_id = coalesce(v_ult.proveedor_id, proveedor_id)
    where id = v_id;
  end loop;

  return v_nueva;
end;
$$;

revoke execute on function public.reemplazar_compra(
  uuid, uuid, uuid, date, numeric, numeric, numeric, numeric, text, text, text, numeric, boolean, date, numeric, numeric, numeric, numeric
) from public, anon;

grant execute on function public.reemplazar_compra(
  uuid, uuid, uuid, date, numeric, numeric, numeric, numeric, text, text, text, numeric, boolean, date, numeric, numeric, numeric, numeric
) to authenticated;

-- Al insertar, la compra vincula el proveedor con el insumo. Editar ya no
-- borra e inserta, así que un cambio de proveedor no disparaba ese vínculo.
-- El mismo trigger corre también al actualizar el proveedor (o el insumo, o
-- la fecha, que es la que guarda ultima_compra).
drop trigger if exists compra_vincula_proveedor on public.compras;
create trigger compra_vincula_proveedor
  after insert or update of proveedor_id, insumo_id, fecha
  on public.compras
  for each row execute function public.vincular_proveedor_insumo();

notify pgrst, 'reload schema';
