-- El stock de un insumo no puede quedar bajo cero.
-- Corre DESPUÉS de cocina-recupera-iva-editar.sql ("stock" ordena después
-- de "editar"). Reemplaza reemplazar_compra y revertir_compra_de_insumo,
-- y vuelve a dejar el vínculo del proveedor. No borra filas ni datos.
-- No está corrido en producción: se pega a mano, una vez.
--
-- Si editar o borrar una compra dejaría el stock negativo (porque ya se usó
-- parte), la operación se cancela entera. No se aplasta a cero en silencio.
-- El error empieza con BOLO_STOCK_NEGATIVO para que la pantalla lo reconozca.
--
-- Antes de pegarlo, compara:
--
--   select p.proname, pg_get_functiondef(p.oid)
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and p.proname in (
--       'apply_compra_to_insumo',
--       'revertir_compra_de_insumo',
--       'reemplazar_compra',
--       'vincular_proveedor_insumo',
--       'bolo_rechazar_stock_negativo'
--     );
--
--   select tgname, pg_get_triggerdef(t.oid)
--   from pg_trigger t
--   join pg_class c on c.oid = t.tgrelid
--   join pg_namespace n on n.oid = c.relnamespace
--   where n.nspname = 'public'
--     and c.relname = 'compras'
--     and tgname in (
      'compra_vincula_proveedor',
      'compra_vincula_proveedor_borrar',
      'compra_revert_from_insumo'
    )
--     and not t.tgisinternal;

-- Avisa y aborta si mover el stock en `p_delta` (unidad base) lo dejaría
-- negativo. Bloquea la fila del insumo. No escribe nada.
create or replace function public.bolo_rechazar_stock_negativo(
  p_insumo_id uuid,
  p_delta numeric
) returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_stock numeric;
  v_nombre text;
  v_unidad text;
  v_nuevo numeric;
begin
  select coalesce(stock_actual, 0),
         coalesce(nombre, 'Insumo'),
         coalesce(nullif(unidad_base, ''), nullif(unidad_compra, ''), '')
    into v_stock, v_nombre, v_unidad
    from public.insumos
   where id = p_insumo_id
   for update;

  if not found then
    return;
  end if;

  v_nuevo := v_stock + coalesce(p_delta, 0);
  if v_nuevo < 0 then
    raise exception 'BOLO_STOCK_NEGATIVO|%|%|%|%',
      replace(v_nombre, '|', ' '),
      trim(to_char(v_stock, 'FM999999990.999999')),
      v_unidad,
      trim(to_char(-v_nuevo, 'FM999999990.999999'))
      using errcode = 'P0001';
  end if;
end;
$$;

revoke execute on function public.bolo_rechazar_stock_negativo(uuid, numeric) from public, anon;
grant execute on function public.bolo_rechazar_stock_negativo(uuid, numeric) to authenticated;

-- Al borrar, el precio que vuelve es el de la compra que sigue viva.
-- El stock se resta entero. Si quedaría negativo, no se borra.
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
  v_ult_monto numeric;
  v_pen_monto numeric;
begin
  perform set_config('bolo.motivo', 'compra_revertida', true);

  select cantidad_por_compra into v_factor_vivo
    from public.insumos where id = old.insumo_id
    for update;

  v_stock_sub := old.cantidad
    * coalesce(old.cantidad_por_compra_snap, v_factor_vivo, 1);

  perform public.bolo_rechazar_stock_negativo(old.insumo_id, -v_stock_sub);

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
      stock_actual = coalesce(stock_actual, 0) - v_stock_sub,
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
    v_ult_monto := coalesce(v_ult.costo_usd, v_ult.precio_total_usd);
    v_ult_unit := case
      when v_ult.cantidad > 0 then v_ult_monto / v_ult.cantidad
      else v_ult_monto
    end;
    if v_hay_pen then
      v_pen_monto := coalesce(v_pen.costo_usd, v_pen.precio_total_usd);
      v_pen_unit := case
        when v_pen.cantidad > 0 then v_pen_monto / v_pen.cantidad
        else v_pen_monto
      end;
    end if;

    update public.insumos set
      stock_actual = coalesce(stock_actual, 0) - v_stock_sub,
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

-- Edita en el mismo renglón y mueve el stock por la diferencia.
-- Si la diferencia dejaría el stock negativo, no guarda.
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
  if v_old.insumo_id = p_insumo_id then
    v_stock_nuevo := p_cantidad * v_factor_viejo;
    v_factor_nuevo := v_factor_viejo;
    perform public.bolo_rechazar_stock_negativo(
      p_insumo_id, v_stock_nuevo - v_stock_viejo
    );
  else
    v_stock_nuevo := p_cantidad * v_factor_nuevo;
    perform public.bolo_rechazar_stock_negativo(v_old.insumo_id, -v_stock_viejo);
    perform public.bolo_rechazar_stock_negativo(p_insumo_id, v_stock_nuevo);
  end if;

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

-- La última compra del par insumo+proveedor sale de las compras que quedan,
-- no del mayor entre la fecha vieja y la nueva. Así, adelantar la fecha o
-- borrar la compra no deja una fecha que ya no existe.
create or replace function public.vincular_proveedor_insumo()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_ultima date;
begin
  if tg_table_name = 'compras' then
    if tg_op = 'DELETE' then
      if old.proveedor_id is not null then
        select max(c.fecha) into v_ultima
          from public.compras c
         where c.insumo_id = old.insumo_id
           and c.proveedor_id = old.proveedor_id;
        update public.insumo_proveedores
           set ultima_compra = v_ultima
         where insumo_id = old.insumo_id
           and proveedor_id = old.proveedor_id;
      end if;
      return old;
    end if;

    if new.proveedor_id is not null then
      select max(c.fecha) into v_ultima
        from public.compras c
       where c.insumo_id = new.insumo_id
         and c.proveedor_id = new.proveedor_id;
      insert into public.insumo_proveedores (insumo_id, proveedor_id, ultima_compra)
      values (new.insumo_id, new.proveedor_id, v_ultima)
      on conflict (insumo_id, proveedor_id) do update
        set ultima_compra = excluded.ultima_compra;
    end if;

    if tg_op = 'UPDATE'
       and old.proveedor_id is not null
       and (
         old.proveedor_id is distinct from new.proveedor_id
         or old.insumo_id is distinct from new.insumo_id
       ) then
      select max(c.fecha) into v_ultima
        from public.compras c
       where c.insumo_id = old.insumo_id
         and c.proveedor_id = old.proveedor_id;
      update public.insumo_proveedores
         set ultima_compra = v_ultima
       where insumo_id = old.insumo_id
         and proveedor_id = old.proveedor_id;
    end if;
    return new;
  end if;

  if new.proveedor_id is null then
    return new;
  end if;
  insert into public.insumo_proveedores (insumo_id, proveedor_id)
  values (new.id, new.proveedor_id)
  on conflict (insumo_id, proveedor_id) do nothing;
  return new;
end;
$$;

drop trigger if exists compra_vincula_proveedor on public.compras;
create trigger compra_vincula_proveedor
  after insert or update of proveedor_id, insumo_id, fecha
  on public.compras
  for each row execute function public.vincular_proveedor_insumo();

drop trigger if exists compra_vincula_proveedor_borrar on public.compras;
create trigger compra_vincula_proveedor_borrar
  after delete on public.compras
  for each row execute function public.vincular_proveedor_insumo();

notify pgrst, 'reload schema';
