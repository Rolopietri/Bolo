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
-- El nombre "cocina-zzz-…" hace que este archivo se aplique de ÚLTIMO en orden
-- alfabético, así estas definiciones SIEMPRE ganan y no pueden ser pisadas por
-- una versión vieja al reaplicar el repo.
--
-- Funciones canónicas aquí:
--   • descontar_stock_por_venta        (venta → baja stock; insumo/receta/extra/swap)
--   • revertir_stock_por_venta         (borrar venta → repone stock)
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

-- ─── descontar_stock_por_venta ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.descontar_stock_por_venta()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  r record;
  v_qty numeric;
  v_target uuid;
begin
  if new.insumo_id is not null then
    v_qty := coalesce(new.insumo_cantidad, 1) * new.cantidad;
    update public.insumos
       set stock_actual = greatest(0, stock_actual - v_qty)
     where id = new.insumo_id;
    if new.swap_from_insumo_id is not null then
      update public.insumos
         set stock_actual = stock_actual + v_qty
       where id = new.swap_from_insumo_id;
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
      update public.insumos
      set stock_actual = greatest(0, stock_actual - r.total)
      where id = v_target;
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
      update public.insumos
      set stock_actual = greatest(0, stock_actual - r.total)
      where id = v_target;
    end loop;
  end if;

  return new;
end;
$function$;

-- ─── revertir_stock_por_venta ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.revertir_stock_por_venta()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  r record;
  v_qty numeric;
  v_target uuid;
begin
  if old.insumo_id is not null then
    v_qty := coalesce(old.insumo_cantidad, 1) * old.cantidad;
    update public.insumos
       set stock_actual = stock_actual + v_qty
     where id = old.insumo_id;
    if old.swap_from_insumo_id is not null then
      update public.insumos
         set stock_actual = greatest(0, stock_actual - v_qty)
       where id = old.swap_from_insumo_id;
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
      update public.insumos
      set stock_actual = stock_actual + r.total
      where id = v_target;
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
      update public.insumos
      set stock_actual = stock_actual + r.total
      where id = v_target;
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
