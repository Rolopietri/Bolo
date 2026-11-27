-- Cocina · Arreglos de QA (27 nov 2026)
--  Acentos rotos en 12 funciones vivas, stock que no se recorta a 0 en silencio,
--  N5 (penúltima compra al editar), salidas "en uso" visibles en la ficha, y
--  «deshacer» cancela una pregunta de cantidad pendiente en Telegram.
--
-- Aplicar en producción DESPUÉS de bolo-15, cocina-jornada-cierre,
-- cocina-jornada-horario y cocina-jornada-sincro (ya aplicados el 27 nov 2026).
-- Idempotente: solo CREATE OR REPLACE de funciones. No toca datos.
--
-- CORREGIDO al aplicar (27 nov 2026, hora de Caracas): el cuerpo original de
-- este PR se armó con definiciones vivas ANTERIORES a cocina_jornada_sincro.
-- Esta versión parte de las definiciones vivas posteriores a esa migración y
-- solo suma los arreglos de QA (acentos, movimiento en_uso, rechazo en vez de
-- greatest(0), cancelar la pregunta con deshacer, N5). Cambios respecto del
-- archivo del PR:
--   • no reescribe _telegram_resumen_datos (conserva la ventana de jornada);
--   • reemplazar_compra conserva precio_actualizado = _cocina_fecha_civil(...)
--     y añade el recálculo de penultima_* (N5);
--   • registrar_perdida_stock y registrar_procesamiento siguen usando
--     jornada_fecha() (no current_date) y rechazan si el stock no alcanza.
--
-- Sección 1 — las 12 funciones, solo corrección de acentos (mismo cuerpo vivo).
-- Sección 2 — reemplazar_compra: recalcula penultima_* (N5). Si al cambiar de
--   insumo el anterior se queda sin compras, se conserva su precio (N4, ya
--   era así: el bucle hace `continue` y no borra precio_compra_usd).
-- Sección 3 — `_prod_uso` deja de recortar el almacén a 0 y escribe un
--   movimiento `en_uso` en stock_movimientos (la ficha puede mostrar la salida).
--   El resto de descuentos de stock físico dejan de usar greatest(0) y rechazan
--   si no alcanza (mismo formato BOLO_STOCK_NEGATIVO; menaje en frase propia).
-- Sección 4 — telegram_deshacer cancela la pregunta pendiente de cantidad
--   (estado rechazado/descartado con sin_cantidad y sin completado_con_mensaje)
--   y devuelve {ok:true, cancelo_pregunta:true, movimiento:...}.

-- ═══════════════════════════════════════════════════════════════════════════
-- Sección 1. Solo acentos
-- ═══════════════════════════════════════════════════════════════════════════

-- _prod_aplicar (solo acentos, cuerpo vivo del 27 nov 2026)
CREATE OR REPLACE FUNCTION public._prod_aplicar(p_pendiente uuid, p_acciones jsonb, p_responsable text, p_origen text, p_corregir uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a jsonb; res jsonb := '[]'::jsonb; r jsonb; r1 jsonb; v_ins uuid; hubo_ok boolean := false;
begin
  for a in select * from jsonb_array_elements(coalesce(p_acciones, '[]'::jsonb)) loop
    v_ins := nullif(a ->> 'insumo_id', '')::uuid;
    case a ->> 'tipo'
      when 'entrada' then
        r := public._prod_entrada(v_ins, (a ->> 'crudo')::numeric, p_responsable, p_origen, p_pendiente);
        -- Solo si el mensaje respondía al aviso de una salida rechazada (o a esa
        -- salida): la entrada que faltaba la registra.
        if (r ->> 'ok')::boolean and p_corregir is not null then
          r := r || jsonb_build_object('corregidos', public._prod_corregir_salida(v_ins, p_corregir, p_responsable));
        end if;
      when 'salida' then
        r := public._prod_salida(v_ins, (a ->> 'procesado')::numeric, p_responsable);
      when 'completo' then
        r1 := public._prod_entrada(v_ins, (a ->> 'crudo')::numeric, p_responsable, p_origen, p_pendiente);
        if (r1 ->> 'ok')::boolean then
          r := public._prod_salida(v_ins, (a ->> 'procesado')::numeric, p_responsable)
               || jsonb_build_object('tipo', 'completo', 'faltaba', r1 -> 'faltaba',
                                     'almacen_antes', r1 -> 'almacen_antes', 'marcado_procesa', r1 -> 'marcado_procesa');
          if not (r ->> 'ok')::boolean then
            -- La salida no pasó (más que la entrada): se deshace la entrada recién abierta.
            perform set_config('bolo.motivo', 'procesamiento_revertido', true);
            update public.insumos set stock_actual = coalesce(stock_actual, 0) + (a ->> 'crudo')::numeric where id = v_ins;
            delete from public.procesamientos_abiertos where id = (r1 ->> 'lote_id')::uuid;
          end if;
        else
          r := r1;
        end if;
      when 'uso' then
        r := public._prod_uso(v_ins, (a ->> 'cantidad')::numeric);
      when 'perdida' then
        r := public._prod_perdida(v_ins, (a ->> 'cantidad')::numeric, a ->> 'motivo');
      when 'devolucion' then
        r := public._prod_devolucion(v_ins, (a ->> 'cantidad')::numeric);
      else
        r := jsonb_build_object('ok', false, 'tipo', a ->> 'tipo', 'error', 'tipo');
    end case;
    if (r ->> 'ok')::boolean then hubo_ok := true; end if;
    res := res || jsonb_build_array(r);
  end loop;
  if p_pendiente is not null then
    update public.produccion_pendientes
       set estado = case when hubo_ok then 'aplicado' else 'rechazado' end,
           resultado = res, aplicado_at = now()
     where id = p_pendiente;
  end if;
  return res;
end $function$;

-- _prod_deshacer (solo acentos, cuerpo vivo del 27 nov 2026)
CREATE OR REPLACE FUNCTION public._prod_deshacer(p_pendiente uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare p public.produccion_pendientes; e jsonb; l jsonb; c jsonb; v_ins uuid; v_c numeric; v_otro uuid;
begin
  select * into p from public.produccion_pendientes where id = p_pendiente for update;
  if not found then raise exception 'No encontré ese mensaje en Bolo.'; end if;
  if p.estado <> 'aplicado' then raise exception 'Ese mensaje no tiene movimientos registrados.'; end if;
  if p.enviado_at < now() - interval '3 days' then
    raise exception 'Ese mensaje tiene más de 3 días; corrígelo desde Bolo.';
  end if;
  perform set_config('bolo.motivo', 'telegram_deshacer', true);
  -- De lo último a lo primero, por si el mensaje traía entrada y salida.
  for e in
    select x from jsonb_array_elements(p.resultado) with ordinality as t(x, ord) order by ord desc
  loop
    if not coalesce((e ->> 'ok')::boolean, false) then continue; end if;
    v_ins := (e ->> 'insumo_id')::uuid;
    case e ->> 'tipo'
      when 'entrada' then
        -- Primero, las salidas que esta entrada corrigió (siguen siendo suyas).
        for c in select * from jsonb_array_elements(coalesce(e -> 'corregidos', '[]'::jsonb)) loop
          v_otro := nullif(c ->> 'pendiente_id', '')::uuid;
          if v_otro is null and c ->> 'proc_id' is not null then
            select id into v_otro from public.produccion_pendientes
             where estado = 'aplicado' and jsonb_typeof(resultado) = 'array'
               and resultado @> jsonb_build_array(jsonb_build_object('proc_id', c ->> 'proc_id'))
             limit 1;
          end if;
          if v_otro is not null and exists (select 1 from public.produccion_pendientes where id = v_otro and estado = 'aplicado') then
            perform public._prod_deshacer(v_otro);
          end if;
        end loop;
        delete from public.procesamientos_abiertos where id = (e ->> 'lote_id')::uuid;
        if not found then
          raise exception 'La entrada de % ya tiene su salida registrada: deshaz primero la salida.', e ->> 'nombre';
        end if;
        update public.insumos set stock_actual = coalesce(stock_actual, 0) + (e ->> 'crudo')::numeric where id = v_ins;
      when 'salida', 'completo' then
        if e ->> 'proc_id' is null then
          raise exception 'Ese registro es anterior a esta función y no se puede deshacer desde Telegram; corrígelo desde Bolo.';
        end if;
        perform public._prod_exigir_en_uso(v_ins, (e ->> 'procesado')::numeric, e ->> 'nombre', e ->> 'unidad_base');
        update public.insumos
           set stock_procesado = greatest(0, coalesce(stock_procesado, 0) - (e ->> 'procesado')::numeric),
               stock_actual = coalesce(stock_actual, 0) + case when e ->> 'tipo' = 'completo' then (e ->> 'crudo')::numeric else 0 end
         where id = v_ins;
        delete from public.procesamientos where id = (e ->> 'proc_id')::uuid;
        if e ->> 'mov_id' is not null then delete from public.stock_movimientos where id = (e ->> 'mov_id')::uuid; end if;
        if e ->> 'tipo' = 'salida' then
          -- Las entradas que cerró vuelven a la mesa, tal como estaban.
          for l in select * from jsonb_array_elements(coalesce(e -> 'lotes_detalle', '[]'::jsonb)) loop
            insert into public.procesamientos_abiertos (id, insumo_id, crudo, responsable, origen, pendiente_id, abierto_at)
            values ((l ->> 'id')::uuid, v_ins, (l ->> 'crudo')::numeric, l ->> 'responsable',
                    coalesce(l ->> 'origen', 'telegram'), nullif(l ->> 'pendiente_id', '')::uuid,
                    coalesce((l ->> 'abierto_at')::timestamptz, now()))
            on conflict (id) do nothing;
          end loop;
        end if;
      when 'uso' then
        v_c := (e ->> 'cantidad')::numeric;
        perform public._prod_exigir_en_uso(v_ins, v_c, e ->> 'nombre', e ->> 'unidad_base');
        update public.insumos
           set stock_actual = coalesce(stock_actual, 0) + v_c,
               stock_procesado = greatest(0, coalesce(stock_procesado, 0) - v_c)
         where id = v_ins;
      when 'perdida' then
        update public.insumos
           set stock_procesado = coalesce(stock_procesado, 0) + coalesce((e ->> 'de_uso')::numeric, 0),
               stock_actual = coalesce(stock_actual, 0) + coalesce((e ->> 'de_almacen')::numeric, 0)
         where id = v_ins;
        if e ->> 'mov_id' is not null then delete from public.stock_movimientos where id = (e ->> 'mov_id')::uuid; end if;
      when 'devolucion' then
        v_c := (e ->> 'cantidad')::numeric;
        if coalesce((select stock_actual from public.insumos where id = v_ins), 0) + 0.00005 < v_c then
          raise exception 'Ya se usó parte de lo devuelto de %; corrígelo desde Bolo.', e ->> 'nombre';
        end if;
        update public.insumos
           set stock_actual = greatest(0, coalesce(stock_actual, 0) - v_c),
               stock_procesado = coalesce(stock_procesado, 0) + v_c
         where id = v_ins;
      else
        null;
    end case;
  end loop;
  update public.produccion_pendientes set estado = 'deshecho', aplicado_at = now() where id = p.id;
  return p.resultado;
end $function$;

-- _prod_exigir_en_uso (solo acentos, cuerpo vivo del 27 nov 2026)
CREATE OR REPLACE FUNCTION public._prod_exigir_en_uso(p_insumo uuid, p_cantidad numeric, p_nombre text, p_unidad text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_uso numeric;
begin
  select coalesce(stock_procesado, 0) into v_uso from public.insumos where id = p_insumo;
  if v_uso + 0.00005 < coalesce(p_cantidad, 0) then
    raise exception 'Ya se usó parte de lo que salió de % (en uso quedan %, la salida fue de %); corrígelo desde Bolo.',
      p_nombre,
      case when p_unidad in ('g', 'gr') then round(v_uso / 1000, 2) || ' kg'
           when p_unidad = 'ml' then round(v_uso / 1000, 2) || ' L' else round(v_uso, 2) || ' ' || coalesce(p_unidad, '') end,
      case when p_unidad in ('g', 'gr') then round(p_cantidad / 1000, 2) || ' kg'
           when p_unidad = 'ml' then round(p_cantidad / 1000, 2) || ' L' else round(p_cantidad, 2) || ' ' || coalesce(p_unidad, '') end;
  end if;
end $function$;

-- _prod_perdida (solo acentos, cuerpo vivo del 27 nov 2026)
CREATE OR REPLACE FUNCTION public._prod_perdida(p_insumo uuid, p_cantidad numeric, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare r public.insumos; v_lotes boolean; v_de_uso numeric := 0; v_de_alm numeric; v_mov uuid;
        v_tipo text := case when p_motivo in ('mal_estado', 'vencimiento') then p_motivo else 'perdida' end;
begin
  if p_cantidad is null or p_cantidad <= 0 then
    return jsonb_build_object('ok', false, 'tipo', 'perdida', 'error', 'cantidad');
  end if;
  select * into r from public.insumos where id = p_insumo for update;
  if not found then return jsonb_build_object('ok', false, 'tipo', 'perdida', 'error', 'insumo'); end if;
  v_lotes := coalesce(r.se_procesa, false) or coalesce(r.se_usa_por_lotes, false);
  if v_lotes then v_de_uso := least(coalesce(r.stock_procesado, 0), p_cantidad); end if;
  v_de_alm := p_cantidad - v_de_uso;
  perform set_config('bolo.motivo', 'perdida_telegram', true);
  update public.insumos
     set stock_procesado = coalesce(stock_procesado, 0) - v_de_uso,
         stock_actual = greatest(0, coalesce(stock_actual, 0) - v_de_alm)
   where id = p_insumo;
  insert into public.stock_movimientos (insumo_id, tipo, capa, cantidad, motivo, fecha, nota)
  values (p_insumo, v_tipo, 'total', -p_cantidad, 'Telegram', public._prod_hoy(),
          case when v_de_uso > 0 then 'De en uso' || case when v_de_alm > 0 then ' y del almacén' else '' end else 'Del almacén' end)
  returning id into v_mov;
  return jsonb_build_object(
    'ok', true, 'tipo', 'perdida', 'insumo_id', p_insumo, 'nombre', r.nombre, 'unidad_base', r.unidad_base,
    'cantidad', p_cantidad, 'motivo', v_tipo, 'de_uso', v_de_uso, 'de_almacen', v_de_alm, 'mov_id', v_mov,
    'almacen_antes', coalesce(r.stock_actual, 0),
    'faltaba', v_de_alm > coalesce(r.stock_actual, 0) + 0.00005);
end $function$;

-- _prod_salida (solo acentos, cuerpo vivo del 27 nov 2026)
CREATE OR REPLACE FUNCTION public._prod_salida(p_insumo uuid, p_procesado numeric, p_responsable text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  r public.insumos; lo record; v_fecha date := public._prod_hoy();
  v_total numeric := 0; v_ids uuid[] := '{}'; v_n int := 0; v_det jsonb := '[]'::jsonb;
  v_resp text; v_origen text; v_desde timestamptz; v_merma numeric; v_porc numeric;
  v_proc uuid; v_mov uuid;
begin
  if p_procesado is null or p_procesado < 0 then
    return jsonb_build_object('ok', false, 'tipo', 'salida', 'error', 'cantidad');
  end if;
  select * into r from public.insumos where id = p_insumo for update;
  if not found then return jsonb_build_object('ok', false, 'tipo', 'salida', 'error', 'insumo'); end if;

  for lo in
    select * from public.procesamientos_abiertos
     where insumo_id = p_insumo order by abierto_at asc for update
  loop
    v_total := v_total + lo.crudo;
    v_ids := v_ids || lo.id;
    v_n := v_n + 1;
    v_det := v_det || jsonb_build_array(jsonb_build_object(
      'id', lo.id, 'crudo', lo.crudo, 'responsable', lo.responsable, 'origen', lo.origen,
      'pendiente_id', lo.pendiente_id, 'abierto_at', lo.abierto_at));
    v_resp := coalesce(v_resp, lo.responsable);
    v_origen := coalesce(v_origen, lo.origen);
    v_desde := coalesce(v_desde, lo.abierto_at);
    exit when v_total + 0.00005 >= p_procesado;
  end loop;

  if v_n = 0 then
    return jsonb_build_object('ok', false, 'tipo', 'salida', 'error', 'sin_entrada',
      'insumo_id', p_insumo, 'nombre', r.nombre, 'unidad_base', r.unidad_base, 'procesado', p_procesado);
  end if;
  if p_procesado > v_total + 0.00005 then
    return jsonb_build_object('ok', false, 'tipo', 'salida', 'error', 'mas_que_entrada',
      'insumo_id', p_insumo, 'nombre', r.nombre, 'unidad_base', r.unidad_base,
      'procesado', p_procesado, 'crudo', v_total, 'lotes', v_n);
  end if;

  v_merma := v_total - p_procesado;
  v_porc := case when v_total > 0 then v_merma / v_total * 100 else 0 end;
  perform set_config('bolo.motivo', 'procesamiento', true);
  update public.insumos set stock_procesado = coalesce(stock_procesado, 0) + p_procesado where id = p_insumo;
  if v_merma > 0 then
    insert into public.stock_movimientos (insumo_id, tipo, capa, cantidad, motivo, fecha, nota)
    values (p_insumo, 'merma', 'total', -v_merma, 'Procesamiento', v_fecha,
            'Lote ' || case when v_origen = 'telegram' then 'desde Telegram' else 'de producción' end
            || case when v_n > 1 then ' (' || v_n || ' entradas juntas)' else '' end)
    returning id into v_mov;
  end if;
  insert into public.procesamientos (insumo_id, fecha, crudo, procesado, merma_porc, nota, responsable, origen, created_by)
  values (p_insumo, v_fecha, v_total, p_procesado, v_porc,
          case when v_n > 1 then v_n || ' entradas juntas' end,
          coalesce(v_resp, nullif(btrim(coalesce(p_responsable, '')), '')),
          case when v_origen in ('manual', 'escaneo', 'telegram') then v_origen else 'telegram' end, auth.uid())
  returning id into v_proc;
  delete from public.procesamientos_abiertos where id = any (v_ids);
  return jsonb_build_object(
    'ok', true, 'tipo', 'salida', 'insumo_id', p_insumo, 'nombre', r.nombre, 'unidad_base', r.unidad_base,
    'crudo', v_total, 'procesado', p_procesado, 'merma', v_merma, 'merma_porc', round(v_porc, 1),
    'estandar', r.merma_coccion_porc, 'lotes', v_n, 'desde', v_desde,
    'proc_id', v_proc, 'mov_id', v_mov, 'lotes_detalle', v_det);
end $function$;

-- _telegram_resumen_datos (solo acentos, cuerpo vivo del 27 nov 2026)
-- _telegram_resumen_datos: NO se reescribe. La versión viva ya tiene la ventana
-- de la jornada (cocina_jornada_sincro, 27 nov 2026) y los acentos limpios.
-- El cuerpo de la sección 1 de este PR se armó antes de esa migración y
-- devolvería el resumen al día civil.

-- log_stock_auditoria (solo acentos, cuerpo vivo del 27 nov 2026)
CREATE OR REPLACE FUNCTION public.log_stock_auditoria()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_motivo text := nullif(current_setting('bolo.motivo', true), '');
begin
  if (tg_op = 'INSERT') then
    -- Solo registramos el alta si nace con algo de stock.
    if coalesce(new.stock_actual, 0) <> 0
       or coalesce(new.stock_comprometido, 0) <> 0 then
      insert into public.stock_auditoria (
        insumo_id, insumo_nombre, unidad_base,
        stock_anterior, stock_nuevo,
        comprometido_anterior, comprometido_nuevo,
        origen, changed_by, motivo
      ) values (
        new.id, new.nombre, new.unidad_base,
        null, new.stock_actual,
        null, new.stock_comprometido,
        'alta', v_actor, coalesce(v_motivo, 'alta')
      );
    end if;
    return new;
  end if;

  -- UPDATE: registrar solo si cambió alguna de las dos capas de stock.
  if new.stock_actual is distinct from old.stock_actual
     or coalesce(new.stock_comprometido, 0)
        is distinct from coalesce(old.stock_comprometido, 0) then
    insert into public.stock_auditoria (
      insumo_id, insumo_nombre, unidad_base,
      stock_anterior, stock_nuevo,
      comprometido_anterior, comprometido_nuevo,
      origen, changed_by, motivo
    ) values (
      new.id, new.nombre, new.unidad_base,
      old.stock_actual, new.stock_actual,
      old.stock_comprometido, new.stock_comprometido,
      case when v_actor is not null then 'app' else 'directo' end,
      v_actor,
      coalesce(v_motivo, case when v_actor is not null then 'edicion' end)
    );
  end if;

  return new;
end;
$function$;

-- revertir_stock_por_venta (solo acentos, cuerpo vivo del 27 nov 2026)
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

-- telegram_deshacer (solo acentos, cuerpo vivo del 27 nov 2026)
CREATE OR REPLACE FUNCTION public.telegram_deshacer(p_secreto text, p_chat bigint, p_message_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare c public.produccion_telegram; v_id uuid; v_res jsonb;
begin
  select * into c from public.produccion_telegram where id = 1;
  if c.id is null or c.secreto is null or p_secreto is distinct from c.secreto then
    raise exception 'no autorizado';
  end if;
  select id into v_id from public.produccion_pendientes where chat_id = p_chat and message_id = p_message_id;
  if v_id is null then
    -- ¿Respondieron a un aviso del bot? Se deshace el mensaje al que respondía.
    select pendiente_id into v_id from public.telegram_respuestas where chat_id = p_chat and bot_message_id = p_message_id;
  end if;
  if v_id is null then
    return jsonb_build_object('ok', false, 'motivo',
      'No encontré ese mensaje entre los registros. Responde con «deshacer» directamente al mensaje original.');
  end if;
  begin
    v_res := public._prod_deshacer(v_id);
  exception when others then
    return jsonb_build_object('ok', false, 'motivo', sqlerrm);
  end;
  return jsonb_build_object('ok', true, 'resultado', v_res);
end $function$;

-- telegram_editar (solo acentos, cuerpo vivo del 27 nov 2026)
CREATE OR REPLACE FUNCTION public.telegram_editar(p_secreto text, p_update jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare c public.produccion_telegram; m jsonb; chat bigint; txt text; nombre text; v_id uuid; v_estado text;
begin
  select * into c from public.produccion_telegram where id = 1;
  if c.id is null or c.secreto is null or p_secreto is distinct from c.secreto then
    return jsonb_build_object('accion', 'rechazado');
  end if;
  m := p_update -> 'edited_message';
  if m is null then return jsonb_build_object('accion', 'ignorado'); end if;
  chat := (m -> 'chat' ->> 'id')::bigint;
  if c.chat_id is null or chat <> c.chat_id or not c.activo then return jsonb_build_object('accion', 'ignorado'); end if;
  txt := coalesce(m ->> 'text', m ->> 'caption');
  nombre := nullif(btrim(coalesce(m -> 'from' ->> 'first_name', '') || ' ' || coalesce(m -> 'from' ->> 'last_name', '')), '');

  select id, estado into v_id, v_estado from public.produccion_pendientes
   where chat_id = chat and message_id = (m ->> 'message_id')::bigint for update;

  if v_id is null then
    -- No se había guardado (no parecía un movimiento): se trata como nuevo.
    if txt is null or (txt !~ '\d' and txt !~* '(entrand|saliend|sin procesar|procesad|entr[oó]|sali[oó]|devolv|dañ|vencid|perd)') then
      return jsonb_build_object('accion', 'ignorado');
    end if;
    insert into public.produccion_pendientes (chat_id, message_id, enviado_at, remitente, texto, foto_file_id)
    values (chat, (m ->> 'message_id')::bigint, to_timestamp((m ->> 'date')::bigint), nombre, txt, null)
    returning id into v_id;
    return jsonb_build_object('accion', 'guardado', 'id', v_id, 'texto', txt, 'remitente', nombre, 'foto', false,
      'message_id', (m ->> 'message_id')::bigint, 'token', c.bot_token, 'chat_id', chat);
  end if;

  if v_estado = 'aplicado' then
    begin
      perform public._prod_deshacer(v_id);
    exception when others then
      return jsonb_build_object('accion', 'edicion_rechazada', 'motivo', sqlerrm, 'token', c.bot_token,
        'chat_id', chat, 'message_id', (m ->> 'message_id')::bigint);
    end;
  end if;
  update public.produccion_pendientes
     set texto = txt, estado = 'pendiente', resultado = null, aplicado_at = null
   where id = v_id;
  return jsonb_build_object('accion', 'editado', 'id', v_id, 'texto', txt, 'remitente', nombre, 'foto', false,
    'message_id', (m ->> 'message_id')::bigint, 'token', c.bot_token, 'chat_id', chat, 'antes', v_estado);
end $function$;

-- telegram_recibir_interno (solo acentos, cuerpo vivo del 27 nov 2026)
CREATE OR REPLACE FUNCTION public.telegram_recibir_interno(p_secreto text, p_update jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c produccion_telegram;
  m jsonb;
  txt text;
  foto text;
  chat bigint;
  nombre text;
  v_id uuid;
begin
  select * into c from produccion_telegram where id = 1;
  if c.id is null or c.secreto is null or p_secreto is distinct from c.secreto then
    return jsonb_build_object('accion', 'rechazado');
  end if;
  m := p_update -> 'message';
  if m is null then return jsonb_build_object('accion', 'ignorado'); end if;
  chat := (m -> 'chat' ->> 'id')::bigint;
  txt := coalesce(m ->> 'text', m ->> 'caption');
  nombre := nullif(btrim(coalesce(m -> 'from' ->> 'first_name', '') || ' ' || coalesce(m -> 'from' ->> 'last_name', '')), '');

  if m ? 'migrate_to_chat_id' and chat = c.chat_id then
    update produccion_telegram set chat_id = (m ->> 'migrate_to_chat_id')::bigint, actualizado = now() where id = 1;
    return jsonb_build_object('accion', 'migrado');
  end if;

  -- Chat privado con el bot (que no sea el chat vinculado de producción).
  if (m -> 'chat' ->> 'type') = 'private' and chat is distinct from c.chat_id then
    if txt ~* '^/gerente(@\S+)?(\s|$)' then
      if upper(btrim(regexp_replace(txt, '^/gerente(@\S+)?', '', 'i'))) = c.codigo then
        update produccion_telegram set resumen_chat_id = chat, resumen_nombre = nombre, actualizado = now() where id = 1;
        return jsonb_build_object('accion', 'gerente_vinculado', 'token', c.bot_token, 'chat_id', chat);
      end if;
      return jsonb_build_object('accion', 'gerente_codigo_invalido', 'token', c.bot_token, 'chat_id', chat);
    end if;
    if txt ~* '^/resumen' and chat = c.resumen_chat_id then
      return jsonb_build_object('accion', 'resumen_pedido', 'token', c.bot_token, 'chat_id', chat);
    end if;
    if txt ~* '^/start' then
      return jsonb_build_object('accion', 'start', 'token', c.bot_token, 'chat_id', chat,
                                'es_gerente', chat = c.resumen_chat_id);
    end if;
    return jsonb_build_object('accion', 'ignorado');
  end if;

  if txt ~* '^/vincular(@\S+)?(\s|$)' then
    if upper(btrim(regexp_replace(txt, '^/vincular(@\S+)?', '', 'i'))) = c.codigo then
      update produccion_telegram
         set chat_id = chat,
             chat_titulo = coalesce(m -> 'chat' ->> 'title', m -> 'from' ->> 'first_name'),
             actualizado = now()
       where id = 1;
      return jsonb_build_object('accion', 'vinculado', 'token', c.bot_token, 'chat_id', chat);
    end if;
    return jsonb_build_object('accion', 'codigo_invalido', 'token', c.bot_token, 'chat_id', chat);
  end if;

  if c.chat_id is null or chat <> c.chat_id or not c.activo then
    return jsonb_build_object('accion', 'ignorado');
  end if;

  -- "deshacer" respondiendo a un mensaje del grupo.
  if txt ~* '^\s*(deshacer|deshazlo|anular|anula|borrar|bórralo|cancelar)\M' then
    if m ? 'reply_to_message' then
      return jsonb_build_object('accion', 'deshacer', 'token', c.bot_token, 'chat_id', chat,
        'message_id', (m ->> 'message_id')::bigint,
        'objetivo', (m -> 'reply_to_message' ->> 'message_id')::bigint);
    end if;
    return jsonb_build_object('accion', 'deshacer_sin_respuesta', 'token', c.bot_token, 'chat_id', chat,
      'message_id', (m ->> 'message_id')::bigint);
  end if;

  if jsonb_typeof(m -> 'photo') = 'array' then
    foto := m -> 'photo' -> (jsonb_array_length(m -> 'photo') - 1) ->> 'file_id';
  elsif (m -> 'document' ->> 'mime_type') like 'image/%' then
    foto := m -> 'document' ->> 'file_id';
  end if;
  if foto is null and (txt is null or (txt !~ '\d'
      and txt !~* '(entrand|saliend|sin procesar|procesad|entr[oó]|sali[oó]|devolv|devuel|dañ|vencid|perd|me equivoqu)')) then
    return jsonb_build_object('accion', 'ignorado');
  end if;

  insert into produccion_pendientes (chat_id, message_id, enviado_at, remitente, texto, foto_file_id)
  values (chat, (m ->> 'message_id')::bigint, to_timestamp((m ->> 'date')::bigint), nombre, txt, foto)
  on conflict (chat_id, message_id) do nothing
  returning id into v_id;
  if v_id is null then
    return jsonb_build_object('accion', 'duplicado');
  end if;
  return jsonb_build_object(
    'accion', 'guardado', 'id', v_id, 'texto', txt, 'remitente', nombre, 'foto', foto is not null,
    'message_id', (m ->> 'message_id')::bigint, 'token', c.bot_token, 'chat_id', chat,
    'respuesta_a', (m -> 'reply_to_message' ->> 'message_id')::bigint);
end;
$function$;

-- valorar_movimiento_stock (solo acentos, cuerpo vivo del 27 nov 2026)
CREATE OR REPLACE FUNCTION public.valorar_movimiento_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_precio numeric;
begin
  new.created_by := coalesce(new.created_by, auth.uid());
  -- Solo las salidas de la capa física (pérdidas y faltantes de conteo).
  if new.valor_usd is null and new.capa = 'total' and new.cantidad < 0
     and new.tipo in ('perdida', 'mal_estado', 'merma', 'vencimiento', 'otro', 'ajuste') then
    select precio_base_usd into v_precio from public.insumos where id = new.insumo_id;
    if v_precio is not null then
      new.valor_usd := round(abs(new.cantidad) * v_precio, 4);
    end if;
  end if;
  return new;
end;
$function$;


-- ═══════════════════════════════════════════════════════════════════════════
-- Sección 2. N4 / N5 en reemplazar_compra
-- ═══════════════════════════════════════════════════════════════════════════

-- reemplazar_compra: N5 penultima_* + comentario N4
CREATE OR REPLACE FUNCTION public.reemplazar_compra(p_id uuid, p_insumo_id uuid, p_proveedor_id uuid, p_fecha date, p_cantidad numeric, p_precio_total_usd numeric, p_precio_total_bs numeric, p_tasa_bcv_usada numeric, p_modalidad_pago text, p_notas text, p_numero_factura text, p_flete_usd numeric, p_pagada boolean, p_fecha_pago date, p_base_usd numeric, p_iva_usd numeric, p_exento_usd numeric, p_costo_usd numeric)
 RETURNS compras
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  v_pen public.compras;
  v_hay_pen boolean;
  v_pen_monto numeric;
  v_pen_unit numeric;
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
    -- N4: si al cambiar de insumo el anterior se queda sin compras,
    -- se conserva su precio (no se anula ultima_* ni precio_compra_usd).
    if not found then
      continue;
    end if;

    -- N5: la penúltima también se recalcula (el borrado de compra ya lo hacía).
    v_hay_pen := false;
    v_pen := null;
    select * into v_pen
      from public.compras
     where insumo_id = v_id
       and id is distinct from v_ult.id
     order by fecha desc, created_at desc, id desc
     limit 1;
    v_hay_pen := found;

    v_monto := coalesce(v_ult.costo_usd, v_ult.precio_total_usd);
    v_unit := case
      when v_ult.cantidad > 0 then v_monto / v_ult.cantidad
      else v_monto
    end;
    select coalesce(v_ult.cantidad_por_compra_snap, cantidad_por_compra, 1)
      into v_factor
      from public.insumos where id = v_id;

    if v_hay_pen then
      v_pen_monto := coalesce(v_pen.costo_usd, v_pen.precio_total_usd);
      v_pen_unit := case
        when v_pen.cantidad > 0 then v_pen_monto / v_pen.cantidad
        else v_pen_monto
      end;
    end if;

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
      -- Frescura: día civil del registro de la compra vigente, no su fecha de jornada.
      precio_actualizado = public._cocina_fecha_civil(v_ult.created_at),
      proveedor_id = coalesce(v_ult.proveedor_id, proveedor_id),
      penultima_fecha = case when v_hay_pen then v_pen.fecha else null end,
      penultima_cantidad = case when v_hay_pen then v_pen.cantidad else null end,
      penultima_precio_usd = case when v_hay_pen then v_pen_unit else null end,
      penultima_precio_bs = case
        when not v_hay_pen then null
        when v_pen.cantidad > 0 and v_pen.precio_total_bs is not null
          then v_pen.precio_total_bs / v_pen.cantidad
        else null
      end
    where id = v_id;
  end loop;

  return v_nueva;
end;
$function$
;


-- ═══════════════════════════════════════════════════════════════════════════
-- Sección 3. Uso visible en la ficha y stock que no se recorta a 0
-- ═══════════════════════════════════════════════════════════════════════════

-- Misma firma y mensaje que bolo_rechazar_stock_negativo, sobre stock_procesado
-- (en uso / procesado).
create or replace function public.bolo_rechazar_stock_procesado(
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
  select coalesce(stock_procesado, 0),
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

revoke execute on function public.bolo_rechazar_stock_procesado(uuid, numeric) from public, anon;
grant execute on function public.bolo_rechazar_stock_procesado(uuid, numeric) to authenticated;

create or replace function public.bolo_rechazar_menaje_negativo(
  p_item_id uuid,
  p_delta numeric
) returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_stock numeric;
  v_nombre text;
  v_nuevo numeric;
begin
  select coalesce(cantidad_actual, 0), coalesce(nombre, 'Ítem')
    into v_stock, v_nombre
    from public.menaje_items
   where id = p_item_id
   for update;

  if not found then
    return;
  end if;

  v_nuevo := v_stock + coalesce(p_delta, 0);
  if v_nuevo < 0 then
    raise exception 'No hay suficiente menaje de %: hay % y faltarían %.',
      v_nombre,
      trim(to_char(v_stock, 'FM999999990.999999')),
      trim(to_char(-v_nuevo, 'FM999999990.999999'))
      using errcode = 'P0001';
  end if;
end;
$$;

revoke execute on function public.bolo_rechazar_menaje_negativo(uuid, numeric) from public, anon;
grant execute on function public.bolo_rechazar_menaje_negativo(uuid, numeric) to authenticated;

-- Salida "en uso": descuenta el almacén (o rechaza si no alcanza), suma en uso
-- y deja un renglón en stock_movimientos para que la ficha lo muestre.
CREATE OR REPLACE FUNCTION public._prod_uso(p_insumo uuid, p_cantidad numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare r public.insumos; v_mov uuid;
begin
  if p_cantidad is null or p_cantidad <= 0 then
    return jsonb_build_object('ok', false, 'tipo', 'uso', 'error', 'cantidad');
  end if;
  select * into r from public.insumos where id = p_insumo for update;
  if not found then return jsonb_build_object('ok', false, 'tipo', 'uso', 'error', 'insumo'); end if;
  perform public.bolo_rechazar_stock_negativo(p_insumo, -p_cantidad);
  perform set_config('bolo.motivo', 'en_uso', true);
  update public.insumos
     set stock_actual = coalesce(stock_actual, 0) - p_cantidad,
         stock_procesado = coalesce(stock_procesado, 0) + p_cantidad,
         se_usa_por_lotes = true
   where id = p_insumo;
  insert into public.stock_movimientos (insumo_id, tipo, capa, cantidad, motivo, fecha, nota)
  values (p_insumo, 'en_uso', 'total', -p_cantidad, 'Telegram', public._prod_hoy(),
          'Del almacén a en uso')
  returning id into v_mov;
  return jsonb_build_object(
    'ok', true, 'tipo', 'uso', 'insumo_id', p_insumo, 'nombre', r.nombre, 'unidad_base', r.unidad_base,
    'cantidad', p_cantidad, 'almacen_antes', coalesce(r.stock_actual, 0),
    'faltaba', false, 'mov_id', v_mov);
end $function$;

-- _prod_deshacer: sin recorte a 0; borra el movimiento de un uso.
CREATE OR REPLACE FUNCTION public._prod_deshacer(p_pendiente uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare p public.produccion_pendientes; e jsonb; l jsonb; c jsonb; v_ins uuid; v_c numeric; v_otro uuid;
begin
  select * into p from public.produccion_pendientes where id = p_pendiente for update;
  if not found then raise exception 'No encontré ese mensaje en Bolo.'; end if;
  if p.estado <> 'aplicado' then raise exception 'Ese mensaje no tiene movimientos registrados.'; end if;
  if p.enviado_at < now() - interval '3 days' then
    raise exception 'Ese mensaje tiene más de 3 días; corrígelo desde Bolo.';
  end if;
  perform set_config('bolo.motivo', 'telegram_deshacer', true);
  -- De lo último a lo primero, por si el mensaje traía entrada y salida.
  for e in
    select x from jsonb_array_elements(p.resultado) with ordinality as t(x, ord) order by ord desc
  loop
    if not coalesce((e ->> 'ok')::boolean, false) then continue; end if;
    v_ins := (e ->> 'insumo_id')::uuid;
    case e ->> 'tipo'
      when 'entrada' then
        -- Primero, las salidas que esta entrada corrigió (siguen siendo suyas).
        for c in select * from jsonb_array_elements(coalesce(e -> 'corregidos', '[]'::jsonb)) loop
          v_otro := nullif(c ->> 'pendiente_id', '')::uuid;
          if v_otro is null and c ->> 'proc_id' is not null then
            select id into v_otro from public.produccion_pendientes
             where estado = 'aplicado' and jsonb_typeof(resultado) = 'array'
               and resultado @> jsonb_build_array(jsonb_build_object('proc_id', c ->> 'proc_id'))
             limit 1;
          end if;
          if v_otro is not null and exists (select 1 from public.produccion_pendientes where id = v_otro and estado = 'aplicado') then
            perform public._prod_deshacer(v_otro);
          end if;
        end loop;
        delete from public.procesamientos_abiertos where id = (e ->> 'lote_id')::uuid;
        if not found then
          raise exception 'La entrada de % ya tiene su salida registrada: deshaz primero la salida.', e ->> 'nombre';
        end if;
        update public.insumos set stock_actual = coalesce(stock_actual, 0) + (e ->> 'crudo')::numeric where id = v_ins;
      when 'salida', 'completo' then
        if e ->> 'proc_id' is null then
          raise exception 'Ese registro es anterior a esta función y no se puede deshacer desde Telegram; corrígelo desde Bolo.';
        end if;
        perform public._prod_exigir_en_uso(v_ins, (e ->> 'procesado')::numeric, e ->> 'nombre', e ->> 'unidad_base');
        update public.insumos
           set stock_procesado = coalesce(stock_procesado, 0) - (e ->> 'procesado')::numeric,
               stock_actual = coalesce(stock_actual, 0) + case when e ->> 'tipo' = 'completo' then (e ->> 'crudo')::numeric else 0 end
         where id = v_ins;
        delete from public.procesamientos where id = (e ->> 'proc_id')::uuid;
        if e ->> 'mov_id' is not null then delete from public.stock_movimientos where id = (e ->> 'mov_id')::uuid; end if;
        if e ->> 'tipo' = 'salida' then
          -- Las entradas que cerró vuelven a la mesa, tal como estaban.
          for l in select * from jsonb_array_elements(coalesce(e -> 'lotes_detalle', '[]'::jsonb)) loop
            insert into public.procesamientos_abiertos (id, insumo_id, crudo, responsable, origen, pendiente_id, abierto_at)
            values ((l ->> 'id')::uuid, v_ins, (l ->> 'crudo')::numeric, l ->> 'responsable',
                    coalesce(l ->> 'origen', 'telegram'), nullif(l ->> 'pendiente_id', '')::uuid,
                    coalesce((l ->> 'abierto_at')::timestamptz, now()))
            on conflict (id) do nothing;
          end loop;
        end if;
      when 'uso' then
        v_c := (e ->> 'cantidad')::numeric;
        perform public._prod_exigir_en_uso(v_ins, v_c, e ->> 'nombre', e ->> 'unidad_base');
        update public.insumos
           set stock_actual = coalesce(stock_actual, 0) + v_c,
               stock_procesado = coalesce(stock_procesado, 0) - v_c
         where id = v_ins;
        if e ->> 'mov_id' is not null then delete from public.stock_movimientos where id = (e ->> 'mov_id')::uuid; end if;
      when 'perdida' then
        update public.insumos
           set stock_procesado = coalesce(stock_procesado, 0) + coalesce((e ->> 'de_uso')::numeric, 0),
               stock_actual = coalesce(stock_actual, 0) + coalesce((e ->> 'de_almacen')::numeric, 0)
         where id = v_ins;
        if e ->> 'mov_id' is not null then delete from public.stock_movimientos where id = (e ->> 'mov_id')::uuid; end if;
      when 'devolucion' then
        v_c := (e ->> 'cantidad')::numeric;
        if coalesce((select stock_actual from public.insumos where id = v_ins), 0) + 0.00005 < v_c then
          raise exception 'Ya se usó parte de lo devuelto de %; corrígelo desde Bolo.', e ->> 'nombre';
        end if;
        update public.insumos
           set stock_actual = coalesce(stock_actual, 0) - v_c,
               stock_procesado = coalesce(stock_procesado, 0) + v_c
         where id = v_ins;
      else
        null;
    end case;
  end loop;
  update public.produccion_pendientes set estado = 'deshecho', aplicado_at = now() where id = p.id;
  return p.resultado;
end $function$;

-- _prod_entrada: rechaza si el almacén no alcanza.
CREATE OR REPLACE FUNCTION public._prod_entrada(p_insumo uuid, p_crudo numeric, p_responsable text, p_origen text, p_pendiente uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare r public.insumos; v_lote uuid;
begin
  if p_crudo is null or p_crudo <= 0 then
    return jsonb_build_object('ok', false, 'tipo', 'entrada', 'error', 'cantidad');
  end if;
  select * into r from public.insumos where id = p_insumo for update;
  if not found then return jsonb_build_object('ok', false, 'tipo', 'entrada', 'error', 'insumo'); end if;
  perform public.bolo_rechazar_stock_negativo(p_insumo, -p_crudo);
  perform set_config('bolo.motivo', 'procesamiento_entrada', true);
  update public.insumos
     set stock_actual = coalesce(stock_actual, 0) - p_crudo,
         se_procesa = true
   where id = p_insumo;
  insert into public.procesamientos_abiertos (insumo_id, crudo, responsable, origen, pendiente_id)
  values (p_insumo, p_crudo, nullif(btrim(coalesce(p_responsable, '')), ''), coalesce(p_origen, 'telegram'), p_pendiente)
  returning id into v_lote;
  return jsonb_build_object(
    'ok', true, 'tipo', 'entrada', 'insumo_id', p_insumo, 'nombre', r.nombre, 'unidad_base', r.unidad_base,
    'crudo', p_crudo, 'almacen_antes', coalesce(r.stock_actual, 0),
    'faltaba', false,
    'marcado_procesa', not coalesce(r.se_procesa, false), 'lote_id', v_lote);
end $function$;

-- _prod_perdida: rechaza si, después de tomar de en uso, el almacén no alcanza.
CREATE OR REPLACE FUNCTION public._prod_perdida(p_insumo uuid, p_cantidad numeric, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare r public.insumos; v_lotes boolean; v_de_uso numeric := 0; v_de_alm numeric; v_mov uuid;
        v_tipo text := case when p_motivo in ('mal_estado', 'vencimiento') then p_motivo else 'perdida' end;
begin
  if p_cantidad is null or p_cantidad <= 0 then
    return jsonb_build_object('ok', false, 'tipo', 'perdida', 'error', 'cantidad');
  end if;
  select * into r from public.insumos where id = p_insumo for update;
  if not found then return jsonb_build_object('ok', false, 'tipo', 'perdida', 'error', 'insumo'); end if;
  v_lotes := coalesce(r.se_procesa, false) or coalesce(r.se_usa_por_lotes, false);
  if v_lotes then v_de_uso := least(coalesce(r.stock_procesado, 0), p_cantidad); end if;
  v_de_alm := p_cantidad - v_de_uso;
  if v_de_uso > 0 then
    perform public.bolo_rechazar_stock_procesado(p_insumo, -v_de_uso);
  end if;
  if v_de_alm > 0 then
    perform public.bolo_rechazar_stock_negativo(p_insumo, -v_de_alm);
  end if;
  perform set_config('bolo.motivo', 'perdida_telegram', true);
  update public.insumos
     set stock_procesado = coalesce(stock_procesado, 0) - v_de_uso,
         stock_actual = coalesce(stock_actual, 0) - v_de_alm
   where id = p_insumo;
  insert into public.stock_movimientos (insumo_id, tipo, capa, cantidad, motivo, fecha, nota)
  values (p_insumo, v_tipo, 'total', -p_cantidad, 'Telegram', public._prod_hoy(),
          case when v_de_uso > 0 then 'De en uso' || case when v_de_alm > 0 then ' y del almacén' else '' end else 'Del almacén' end)
  returning id into v_mov;
  return jsonb_build_object(
    'ok', true, 'tipo', 'perdida', 'insumo_id', p_insumo, 'nombre', r.nombre, 'unidad_base', r.unidad_base,
    'cantidad', p_cantidad, 'motivo', v_tipo, 'de_uso', v_de_uso, 'de_almacen', v_de_alm, 'mov_id', v_mov,
    'almacen_antes', coalesce(r.stock_actual, 0),
    'faltaba', false);
end $function$;

-- _venta_descontar_insumo: rechaza si no alcanza el stock físico.
CREATE OR REPLACE FUNCTION public._venta_descontar_insumo(p_insumo uuid, p_qty numeric, p_venta uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_lotes boolean; v_uso numeric; v_de_uso numeric; v_resto numeric;
begin
  if p_insumo is null or p_qty is null or p_qty <= 0 then return; end if;
  select coalesce(se_procesa, false) or coalesce(se_usa_por_lotes, false), coalesce(stock_procesado, 0)
    into v_lotes, v_uso from public.insumos where id = p_insumo for update;
  if not found then return; end if;
  if not v_lotes then
    perform public.bolo_rechazar_stock_negativo(p_insumo, -p_qty);
    update public.insumos set stock_actual = coalesce(stock_actual, 0) - p_qty where id = p_insumo;
    return;
  end if;
  v_de_uso := least(v_uso, p_qty);
  v_resto := p_qty - v_de_uso;
  if v_de_uso > 0 then
    perform public.bolo_rechazar_stock_procesado(p_insumo, -v_de_uso);
  end if;
  if v_resto > 0 then
    perform public.bolo_rechazar_stock_negativo(p_insumo, -v_resto);
  end if;
  update public.insumos
     set stock_procesado = v_uso - v_de_uso,
         stock_actual = case when v_resto > 0 then coalesce(stock_actual, 0) - v_resto else stock_actual end
   where id = p_insumo;
  if v_resto > 0.00005 and p_venta is not null then
    insert into public.avisos_inventario (insumo_id, venta_id, tipo, cantidad)
    values (p_insumo, p_venta, 'venta_sin_uso', v_resto);
  end if;
end $function$;

-- ajustar_menaje_stock: rechaza si la cantidad quedaría negativa.
CREATE OR REPLACE FUNCTION public.ajustar_menaje_stock(p_item_id uuid, p_delta numeric, p_precio_reposicion numeric DEFAULT NULL::numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_nueva numeric;
begin
  perform public.bolo_rechazar_menaje_negativo(p_item_id, p_delta);
  update public.menaje_items
     set cantidad_actual = coalesce(cantidad_actual, 0) + p_delta,
         precio_reposicion_usd = case
           when precio_reposicion_usd is null and p_precio_reposicion is not null
             then p_precio_reposicion
           else precio_reposicion_usd
         end
   where id = p_item_id
   returning cantidad_actual into v_nueva;

  if v_nueva is null then
    raise exception 'Ítem de menaje no encontrado';
  end if;
  return v_nueva;
end;
$function$;

-- ajustar_plan_completado: rechaza si el ajuste dejaría stock negativo.
CREATE OR REPLACE FUNCTION public.ajustar_plan_completado(p_plan_id uuid, p_raciones numeric, p_raciones_consumidas numeric)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_estado   text;
  v_r_old    numeric;
  v_c_old    numeric;
  v_delta    numeric;
  v_comp     record;
  v_estado_nuevo text;
begin
  perform set_config('bolo.motivo', 'plan', true);
  select estado, raciones, coalesce(raciones_consumidas, 0)
    into v_estado, v_r_old, v_c_old
    from public.cocina_planes_produccion
   where id = p_plan_id;

  if v_estado is null then
    raise exception 'Plan no encontrado';
  end if;
  if v_estado not in ('completado', 'vendido') then
    raise exception 'Solo se ajustan planes completados (actual: %)', v_estado;
  end if;
  if p_raciones is null or p_raciones <= 0 then
    raise exception 'Las raciones deben ser mayores a 0.';
  end if;
  if p_raciones_consumidas is null
     or p_raciones_consumidas < 0
     or p_raciones_consumidas > p_raciones then
    raise exception 'Las consumidas deben estar entre 0 y las raciones.';
  end if;

  -- Diferencia de fracción consumida: lo ya servido pasa de C/R a C'/R'.
  v_delta := (p_raciones_consumidas / p_raciones)
             - (v_c_old / nullif(v_r_old, 0));

  if v_delta is not null and v_delta <> 0 then
    for v_comp in
      select insumo_id, cantidad
        from public.cocina_plan_compromisos
       where plan_id = p_plan_id
    loop
      perform public.bolo_rechazar_stock_negativo(v_comp.insumo_id, -(v_comp.cantidad * v_delta));
      update public.insumos
         set stock_actual = stock_actual - v_comp.cantidad * v_delta
       where id = v_comp.insumo_id;
    end loop;
  end if;

  v_estado_nuevo := case
                      when p_raciones_consumidas >= p_raciones then 'vendido'
                      else 'completado'
                    end;

  update public.cocina_planes_produccion
     set raciones            = p_raciones,
         raciones_consumidas = p_raciones_consumidas,
         estado              = v_estado_nuevo
   where id = p_plan_id;

  -- Recalcular el comprometido de todos los insumos afectados.
  perform * from public.recalcular_stock_comprometido();
end;
$function$;

-- borrar_movimiento_stock: al devolver, rechaza si el saldo no da.
CREATE OR REPLACE FUNCTION public.borrar_movimiento_stock(p_id uuid, p_devolver boolean DEFAULT false)
 RETURNS numeric
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_insumo uuid;
  v_capa   text;
  v_cant   numeric;
  v_nuevo  numeric := null;
begin
  perform set_config('bolo.motivo', 'perdida_deshecha', true);
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
    perform public.bolo_rechazar_stock_negativo(v_insumo, -v_cant);
    update public.insumos
       set stock_actual = coalesce(stock_actual, 0) - v_cant
     where id = v_insumo
     returning stock_actual into v_nuevo;
  end if;

  delete from public.stock_movimientos where id = p_id;
  return v_nuevo;
end;
$function$;

-- registrar_perdida_stock: rechaza si el almacén no alcanza.
CREATE OR REPLACE FUNCTION public.registrar_perdida_stock(p_insumo_id uuid, p_tipo text, p_cantidad numeric, p_motivo text DEFAULT NULL::text, p_fecha date DEFAULT NULL::date, p_nota text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, insumo_id uuid, tipo text, capa text, cantidad numeric, motivo text, fecha date, nota text, created_at timestamp with time zone, stock_nuevo numeric)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_nuevo numeric;
  v_mov public.stock_movimientos%rowtype;
begin
  perform set_config('bolo.motivo', 'perdida:' || coalesce(p_tipo, 'otro'), true);
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad debe ser mayor a 0.';
  end if;

  -- Descuento ATÓMICO (bajo lock de fila). Nunca lee-modifica-escribe en cliente.
  perform public.bolo_rechazar_stock_negativo(p_insumo_id, -p_cantidad);
  update public.insumos
     set stock_actual = coalesce(stock_actual, 0) - p_cantidad
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
     coalesce(p_fecha, public.jornada_fecha()), p_nota)
  returning * into v_mov;

  return query
    select v_mov.id, v_mov.insumo_id, v_mov.tipo, v_mov.capa, v_mov.cantidad,
           v_mov.motivo, v_mov.fecha, v_mov.nota, v_mov.created_at, v_nuevo;
end;
$function$;

-- registrar_procesamiento: ya exigía crudo suficiente; deja de recortar a 0.
CREATE OR REPLACE FUNCTION public.registrar_procesamiento(p_insumo_id uuid, p_crudo numeric, p_procesado numeric, p_fecha date DEFAULT NULL::date, p_nota text DEFAULT NULL::text, p_responsable text DEFAULT NULL::text, p_origen text DEFAULT 'manual'::text)
 RETURNS TABLE(insumo_id uuid, stock_crudo numeric, stock_procesado numeric, merma numeric, movimiento_id uuid)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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

  perform public.bolo_rechazar_stock_negativo(p_insumo_id, -p_crudo);
  update public.insumos
     set stock_actual     = coalesce(stock_actual, 0) - p_crudo,
         stock_procesado  = coalesce(stock_procesado, 0) + p_procesado
   where id = p_insumo_id
   returning stock_actual, stock_procesado into v_crudo_nuevo, v_proc_nuevo;

  if v_merma <> 0 then
    insert into public.stock_movimientos
      (insumo_id, tipo, capa, cantidad, motivo, fecha, nota)
    values
      (p_insumo_id, 'merma', 'total', -v_merma, 'Procesamiento',
       coalesce(p_fecha, public.jornada_fecha()), p_nota)
    returning id into v_mov_id;
  end if;

  insert into public.procesamientos
    (insumo_id, fecha, crudo, procesado, merma_porc, nota, responsable, origen, created_by)
  values (
    p_insumo_id, coalesce(p_fecha, public.jornada_fecha()), p_crudo, p_procesado,
    case when p_crudo > 0 then (p_crudo - p_procesado) / p_crudo * 100 else 0 end,
    p_nota, nullif(btrim(coalesce(p_responsable, '')), ''), v_origen, auth.uid()
  );

  return query select p_insumo_id, v_crudo_nuevo, v_proc_nuevo, v_merma, v_mov_id;
end;
$function$;


-- ═══════════════════════════════════════════════════════════════════════════
-- Sección 4. «deshacer» cancela la pregunta pendiente de cantidad
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.telegram_deshacer(p_secreto text, p_chat bigint, p_message_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare c public.produccion_telegram; v_id uuid; v_res jsonb;
        v_est text; v_prev jsonb; v_mov text;
begin
  select * into c from public.produccion_telegram where id = 1;
  if c.id is null or c.secreto is null or p_secreto is distinct from c.secreto then
    raise exception 'no autorizado';
  end if;
  select id into v_id from public.produccion_pendientes where chat_id = p_chat and message_id = p_message_id;
  if v_id is null then
    -- ¿Respondieron a un aviso del bot? Se deshace el mensaje al que respondía.
    select pendiente_id into v_id from public.telegram_respuestas where chat_id = p_chat and bot_message_id = p_message_id;
  end if;
  if v_id is null then
    return jsonb_build_object('ok', false, 'motivo',
      'No encontré ese mensaje entre los registros. Responde con «deshacer» directamente al mensaje original.');
  end if;

  -- Pregunta de cantidad todavía pendiente: no hay movimiento que revertir,
  -- solo se cancela para que el bot no siga esperando el número.
  select estado, resultado into v_est, v_prev
    from public.produccion_pendientes where id = v_id;
  if v_est is distinct from 'aplicado'
     and v_prev is not null
     and jsonb_typeof(v_prev -> 'sin_cantidad') = 'array' then
    if coalesce(v_prev ->> 'completado_con_mensaje', '') <> '' then
      return jsonb_build_object('ok', false, 'motivo',
        'Esa pregunta ya tiene un movimiento registrado. Responde «deshacer» al mensaje donde el bot confirmó la cantidad.');
    end if;
    v_mov := coalesce(v_prev #>> '{sin_cantidad,0,movimiento}', 'salida');
    update public.produccion_pendientes
       set estado = 'descartado',
           resultado = v_prev || jsonb_build_object('cancelado', true),
           aplicado_at = now()
     where id = v_id;
    return jsonb_build_object('ok', true, 'cancelo_pregunta', true, 'movimiento', v_mov);
  end if;

  begin
    v_res := public._prod_deshacer(v_id);
  exception when others then
    return jsonb_build_object('ok', false, 'motivo', sqlerrm);
  end;
  return jsonb_build_object('ok', true, 'resultado', v_res);
end $function$;
