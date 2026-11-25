-- ════════════════════════════════════════════════════════════════════════
-- Cocina · MOTOR CANÓNICO (A5) — fuente de verdad del descuento de stock
-- ════════════════════════════════════════════════════════════════════════
-- Este archivo contiene las definiciones VIVAS y correctas de las funciones del
-- motor de ventas/stock, copiadas tal cual de la base de producción
-- (pg_get_functiondef). Varias de estas funciones están duplicadas en archivos
-- más viejos del repo, y algunas versiones viejas GANABAN por orden alfabético
-- (p.ej. descontar_stock_por_venta: la buena vive en
-- cocina-pos-modificador-sustitucion.sql, pero cocina-pos-sustitucion-insumo.sql
-- ordena después y la degradaría).
--
-- El nombre "cocina-zzz-…" hace que este archivo se aplique después de los
-- otros de cocina, así estas definiciones ganan al reaplicar el repo en orden
-- alfabético.
--
-- Fase D (bolo-08) y BOLO-10: descontar_stock_por_venta y revertir_stock_por_venta
-- mueven stock_procesado (EN USO) cuando el insumo se procesa o se usa por
-- lotes; si EN USO no alcanza, el resto sale del almacén con un aviso.
-- bolo-08-fase-d-ventas-descuentan-procesado.sql ordena ANTES (la b va antes
-- que la c). Si la Fase D viviera solo ahí, reaplicar los SQL en orden
-- alfabético la pisaría con la versión de este archivo sin se_procesa.
-- Por eso esas dos funciones están copiadas aquí, con se_procesa y con el
-- motivo del libro (bolo.motivo). Un archivo bolo-09b-*.sql no evita el pisón:
-- también ordena antes que cocina-zzz-*.
--
-- Funciones canónicas aquí:
--   • descontar_stock_por_venta        (venta → baja stock; insumo/receta/extra/swap; Fase D)
--   • revertir_stock_por_venta         (borrar venta → repone el mismo bolsillo; Fase D)
--   • flatten_receta_insumos           (expande receta+subrecetas con conversión y porciones)
--   • flatten_receta_planes            (idem para planes de producción)
--   • liberar_comprometido_por_venta   (venta/merma → libera reserva de planes, fracción)
--   • recommit_comprometido_por_venta  (deshacer venta → re-reserva)
--
-- recalcular_stock_comprometido: su canónica está en
-- cocina-recalcular-comprometido.sql (más nueva: escribe-solo-si-cambia). Como
-- 'r' < 'z', este archivo NO la redefine y la de allá queda vigente.
--
-- Idempotente (CREATE OR REPLACE). Ver README-migraciones.md.

-- ─── Bolsillo de cada insumo en una venta (BOLO-10) ─────────────────────
-- Un insumo que se procesa (se_procesa) o que se saca por lotes
-- (se_usa_por_lotes) se vende desde lo que está EN USO (stock_procesado).
-- Si EN USO no alcanza, el resto sale del almacén (stock_actual) y queda un
-- aviso en avisos_inventario para confirmar que eso pasó en la cocina y no
-- fue un error de la venta. Los demás insumos salen del almacén como siempre.
create or replace function public._venta_descontar_insumo(p_insumo uuid, p_qty numeric, p_venta uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_lotes boolean; v_uso numeric; v_de_uso numeric; v_resto numeric;
begin
  if p_insumo is null or p_qty is null or p_qty <= 0 then return; end if;
  select coalesce(se_procesa, false) or coalesce(se_usa_por_lotes, false), coalesce(stock_procesado, 0)
    into v_lotes, v_uso from public.insumos where id = p_insumo for update;
  if not found then return; end if;
  if not v_lotes then
    update public.insumos set stock_actual = greatest(0, coalesce(stock_actual, 0) - p_qty) where id = p_insumo;
    return;
  end if;
  v_de_uso := least(v_uso, p_qty);
  v_resto := p_qty - v_de_uso;
  update public.insumos
     set stock_procesado = v_uso - v_de_uso,
         stock_actual = case when v_resto > 0 then greatest(0, coalesce(stock_actual, 0) - v_resto) else stock_actual end
   where id = p_insumo;
  if v_resto > 0.00005 and p_venta is not null then
    insert into public.avisos_inventario (insumo_id, venta_id, tipo, cantidad)
    values (p_insumo, p_venta, 'venta_sin_uso', v_resto);
  end if;
end $$;

-- Lo inverso al borrar una venta: lo que salió del almacén (según su aviso)
-- vuelve al almacén; el resto vuelve a EN USO. El aviso se borra.
create or replace function public._venta_reponer_insumo(p_insumo uuid, p_qty numeric, p_venta uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_lotes boolean; v_alm numeric := 0;
begin
  if p_insumo is null or p_qty is null or p_qty <= 0 then return; end if;
  select coalesce(se_procesa, false) or coalesce(se_usa_por_lotes, false)
    into v_lotes from public.insumos where id = p_insumo for update;
  if not found then return; end if;
  if not v_lotes then
    update public.insumos set stock_actual = coalesce(stock_actual, 0) + p_qty where id = p_insumo;
    return;
  end if;
  if p_venta is not null then
    select coalesce(sum(cantidad), 0) into v_alm
      from public.avisos_inventario where venta_id = p_venta and insumo_id = p_insumo;
    delete from public.avisos_inventario where venta_id = p_venta and insumo_id = p_insumo;
  end if;
  v_alm := least(v_alm, p_qty);
  update public.insumos
     set stock_actual = coalesce(stock_actual, 0) + v_alm,
         stock_procesado = coalesce(stock_procesado, 0) + (p_qty - v_alm)
   where id = p_insumo;
end $$;

-- Las llaman los triggers de ventas con el permiso de quien registra la venta.
revoke execute on function public._venta_descontar_insumo(uuid, numeric, uuid) from public, anon;
revoke execute on function public._venta_reponer_insumo(uuid, numeric, uuid) from public, anon;
grant execute on function public._venta_descontar_insumo(uuid, numeric, uuid) to authenticated, service_role;
grant execute on function public._venta_reponer_insumo(uuid, numeric, uuid) to authenticated, service_role;

-- ─── descontar_stock_por_venta (Fase D + BOLO-10: en uso, si no almacén) ─
CREATE OR REPLACE FUNCTION public.descontar_stock_por_venta()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  r record;
  v_qty numeric;
  v_target uuid;
begin
  perform set_config('bolo.motivo', case when coalesce(new.es_merma, false) then 'merma_receta' else 'venta' end, true);
  if new.insumo_id is not null then
    v_qty := coalesce(new.insumo_cantidad, 1) * new.cantidad;
    perform public._venta_descontar_insumo(new.insumo_id, v_qty, new.id);
    if new.swap_from_insumo_id is not null then
      perform public._venta_reponer_insumo(new.swap_from_insumo_id, v_qty, null);
    end if;
    return new;
  end if;

  if new.receta_id is not null then
    for r in (
      select insumo_id, sum(total_cantidad) as total
      from public.flatten_receta_insumos(new.receta_id, new.cantidad)
      group by insumo_id
    ) loop
      -- "Sin X": swap_from SIN swap_to → se quita ese insumo (no se descuenta).
      if new.swap_from_insumo_id is not null
         and r.insumo_id = new.swap_from_insumo_id
         and new.swap_to_insumo_id is null then
        continue;
      end if;
      v_target := case
        when new.swap_from_insumo_id is not null
         and r.insumo_id = new.swap_from_insumo_id
         and new.swap_to_insumo_id is not null
        then new.swap_to_insumo_id else r.insumo_id end;
      perform public._venta_descontar_insumo(v_target, r.total, new.id);
    end loop;
  end if;

  if new.extra_receta_id is not null then
    for r in (
      select insumo_id, sum(total_cantidad) as total
      from public.flatten_receta_insumos(
        new.extra_receta_id, new.cantidad * coalesce(new.extra_cantidad, 1))
      group by insumo_id
    ) loop
      -- "Sin X": swap_from SIN swap_to → se quita ese insumo (no se descuenta).
      if new.swap_from_insumo_id is not null
         and r.insumo_id = new.swap_from_insumo_id
         and new.swap_to_insumo_id is null then
        continue;
      end if;
      v_target := case
        when new.swap_from_insumo_id is not null
         and r.insumo_id = new.swap_from_insumo_id
         and new.swap_to_insumo_id is not null
        then new.swap_to_insumo_id else r.insumo_id end;
      perform public._venta_descontar_insumo(v_target, r.total, new.id);
    end loop;
  end if;

  return new;
end;
$function$;

-- ─── revertir_stock_por_venta (repone el mismo bolsillo) ────────────────
CREATE OR REPLACE FUNCTION public.revertir_stock_por_venta()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  r record;
  v_qty numeric;
  v_target uuid;
begin
  perform set_config('bolo.motivo', 'venta_revertida', true);
  if old.insumo_id is not null then
    v_qty := coalesce(old.insumo_cantidad, 1) * old.cantidad;
    perform public._venta_reponer_insumo(old.insumo_id, v_qty, old.id);
    if old.swap_from_insumo_id is not null then
      perform public._venta_descontar_insumo(old.swap_from_insumo_id, v_qty, null);
    end if;
    return old;
  end if;

  if old.receta_id is not null then
    for r in (
      select insumo_id, sum(total_cantidad) as total
      from public.flatten_receta_insumos(old.receta_id, old.cantidad)
      group by insumo_id
    ) loop
      -- "Sin X": swap_from SIN swap_to → se quitó ese insumo (nunca se descontó,
      -- así que no se repone).
      if old.swap_from_insumo_id is not null
         and r.insumo_id = old.swap_from_insumo_id
         and old.swap_to_insumo_id is null then
        continue;
      end if;
      v_target := case
        when old.swap_from_insumo_id is not null
         and r.insumo_id = old.swap_from_insumo_id
         and old.swap_to_insumo_id is not null
        then old.swap_to_insumo_id else r.insumo_id end;
      perform public._venta_reponer_insumo(v_target, r.total, old.id);
    end loop;
  end if;

  if old.extra_receta_id is not null then
    for r in (
      select insumo_id, sum(total_cantidad) as total
      from public.flatten_receta_insumos(
        old.extra_receta_id, old.cantidad * coalesce(old.extra_cantidad, 1))
      group by insumo_id
    ) loop
      -- "Sin X": swap_from SIN swap_to → se quitó ese insumo (nunca se descontó,
      -- así que no se repone).
      if old.swap_from_insumo_id is not null
         and r.insumo_id = old.swap_from_insumo_id
         and old.swap_to_insumo_id is null then
        continue;
      end if;
      v_target := case
        when old.swap_from_insumo_id is not null
         and r.insumo_id = old.swap_from_insumo_id
         and old.swap_to_insumo_id is not null
        then old.swap_to_insumo_id else r.insumo_id end;
      perform public._venta_reponer_insumo(v_target, r.total, old.id);
    end loop;
  end if;

  return old;
end;
$function$;

-- ─── flatten_receta_insumos ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.flatten_receta_insumos(p_receta_id uuid, p_factor numeric DEFAULT 1, p_depth integer DEFAULT 0)
 RETURNS TABLE(insumo_id uuid, total_cantidad numeric)
 LANGUAGE plpgsql
AS $function$
declare
  r record; porciones_r int; sub_rend numeric;
  sub_rend_unidad text; sub_porciones numeric; sub_factor numeric; v_cant_conv numeric;
begin
  if p_depth > 5 then return; end if;
  select porciones into porciones_r from public.recetas where id = p_receta_id;
  if porciones_r is null or porciones_r = 0 then return; end if;
  for r in (
    select ri.insumo_id, ri.subreceta_id, ri.cantidad, ri.unidad
    from public.receta_ingredientes ri where ri.receta_id = p_receta_id
  ) loop
    if r.insumo_id is not null then
      return query
        select r.insumo_id,
               (public.convertir_para_costo(r.cantidad, r.unidad, ins.unidad_base)
                 * p_factor / porciones_r::numeric)::numeric
          from public.insumos ins where ins.id = r.insumo_id;
    elsif r.subreceta_id is not null then
      select rendimiento, rendimiento_unidad, porciones
        into sub_rend, sub_rend_unidad, sub_porciones
        from public.recetas where id = r.subreceta_id;
      if sub_rend is null or sub_rend = 0 then continue; end if;
      v_cant_conv := public.convertir_para_costo(r.cantidad, r.unidad, sub_rend_unidad);
      sub_factor := (v_cant_conv * p_factor / porciones_r::numeric)
                    / sub_rend * coalesce(nullif(sub_porciones, 0), 1);
      return query
        select fi.insumo_id, fi.total_cantidad
          from public.flatten_receta_insumos(r.subreceta_id, sub_factor, p_depth + 1) fi;
    end if;
  end loop;
end;
$function$;

-- ─── flatten_receta_planes ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.flatten_receta_planes(p_receta_id uuid, p_factor numeric DEFAULT 1, p_depth integer DEFAULT 0)
 RETURNS TABLE(receta_id uuid, factor numeric)
 LANGUAGE plpgsql
AS $function$
declare
  r record; porciones_r int; sub_rend numeric;
  sub_rend_unidad text; sub_porciones numeric; sub_factor numeric; v_cant_conv numeric;
begin
  if p_depth > 5 then return; end if;
  return query select p_receta_id, p_factor;
  select porciones into porciones_r from public.recetas where id = p_receta_id;
  if porciones_r is null or porciones_r = 0 then return; end if;
  for r in (
    select ri.subreceta_id, ri.cantidad, ri.unidad
    from public.receta_ingredientes ri
    where ri.receta_id = p_receta_id and ri.subreceta_id is not null
  ) loop
    select rendimiento, rendimiento_unidad, porciones
      into sub_rend, sub_rend_unidad, sub_porciones
      from public.recetas where id = r.subreceta_id;
    if sub_rend is null or sub_rend = 0 then continue; end if;
    v_cant_conv := public.convertir_para_costo(r.cantidad, r.unidad, sub_rend_unidad);
    sub_factor := (v_cant_conv * p_factor / porciones_r::numeric)
                  / sub_rend * coalesce(nullif(sub_porciones, 0), 1);
    return query
      select * from public.flatten_receta_planes(r.subreceta_id, sub_factor, p_depth + 1);
  end loop;
end;
$function$;

-- ─── liberar_comprometido_por_venta ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.liberar_comprometido_por_venta()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_target record; v_restante numeric; v_take numeric; v_frac numeric;
  v_plan record; v_comp record;
begin
  if new.receta_id is null then return new; end if;

  for v_target in
    select receta_id as rid, sum(factor) as factor
    from public.flatten_receta_planes(new.receta_id, new.cantidad)
    group by receta_id
  loop
    v_restante := v_target.factor;
    if v_restante is null or v_restante <= 0 then continue; end if;

    for v_plan in
      select id, raciones, coalesce(raciones_consumidas, 0) as consumidas, estado
        from public.cocina_planes_produccion
       where receta_id = v_target.rid
         and estado in ('pendiente', 'completado')
         and coalesce(raciones_consumidas, 0) < raciones
       order by created_at asc
       for update
    loop
      exit when v_restante <= 0;
      v_take := least(v_restante, v_plan.raciones - v_plan.consumidas);
      if v_take <= 0 then continue; end if;
      v_frac := v_take / v_plan.raciones;

      for v_comp in
        select insumo_id, cantidad
          from public.cocina_plan_compromisos where plan_id = v_plan.id
      loop
        update public.insumos
           set stock_comprometido =
                 greatest(0, coalesce(stock_comprometido, 0) - v_comp.cantidad * v_frac)
         where id = v_comp.insumo_id;
      end loop;

      update public.cocina_planes_produccion
         set raciones_consumidas = v_plan.consumidas + v_take,
             raciones_perdidas = coalesce(raciones_perdidas, 0)
               + (case when coalesce(new.es_merma, false) then v_take else 0 end),
             estado = case
                        when v_plan.consumidas + v_take >= v_plan.raciones then 'vendido'
                        else estado
                      end,
             completado_at = case
                        when v_plan.consumidas + v_take >= v_plan.raciones
                          then coalesce(completado_at, now())
                        else completado_at
                      end
       where id = v_plan.id;

      v_restante := v_restante - v_take;
    end loop;
  end loop;

  return new;
end;
$function$;

-- ─── recommit_comprometido_por_venta ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.recommit_comprometido_por_venta()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_target record; v_restante numeric; v_give numeric; v_frac numeric;
  v_plan record; v_comp record;
begin
  if old.receta_id is null then return old; end if;

  for v_target in
    select receta_id as rid, sum(factor) as factor
    from public.flatten_receta_planes(old.receta_id, old.cantidad)
    group by receta_id
  loop
    v_restante := v_target.factor;
    if v_restante is null or v_restante <= 0 then continue; end if;

    for v_plan in
      select id, raciones, coalesce(raciones_consumidas, 0) as consumidas, estado
        from public.cocina_planes_produccion
       where receta_id = v_target.rid
         and coalesce(raciones_consumidas, 0) > 0
         and estado in ('pendiente', 'completado', 'vendido')
       order by created_at desc
       for update
    loop
      exit when v_restante <= 0;
      v_give := least(v_restante, v_plan.consumidas);
      if v_give <= 0 then continue; end if;
      v_frac := v_give / v_plan.raciones;

      for v_comp in
        select insumo_id, cantidad
          from public.cocina_plan_compromisos where plan_id = v_plan.id
      loop
        update public.insumos
           set stock_comprometido = coalesce(stock_comprometido, 0) + v_comp.cantidad * v_frac
         where id = v_comp.insumo_id;
      end loop;

      update public.cocina_planes_produccion
         set raciones_consumidas = v_plan.consumidas - v_give,
             raciones_perdidas = case
                        when coalesce(old.es_merma, false)
                          then greatest(0, coalesce(raciones_perdidas, 0) - v_give)
                        else raciones_perdidas
                      end,
             estado = case
                        when v_plan.estado = 'vendido'
                         and (v_plan.consumidas - v_give) < v_plan.raciones then 'completado'
                        else v_plan.estado
                      end
       where id = v_plan.id;

      v_restante := v_restante - v_give;
    end loop;
  end loop;

  return old;
end;
$function$;
