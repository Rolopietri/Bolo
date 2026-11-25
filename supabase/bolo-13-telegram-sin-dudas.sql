-- ═══════════════════════════════════════════════════════════════════
-- BOLO-13 · Telegram: pérdidas, devoluciones, deshacer y ediciones
-- ═══════════════════════════════════════════════════════════════════
-- Para que el bot nunca registre algo dudoso:
--   • "Se dañaron 2 kg de tomate"  → pérdida (sale de EN USO si hay; si no,
--                                    del almacén) y queda en el libro.
--   • "Devolviendo 3 panes"        → de EN USO al almacén (no para procesados).
--   • Responder a un mensaje con "deshacer" revierte lo que ese mensaje
--     registró (hasta 3 días). Si una entrada ya tiene su salida, primero se
--     deshace la salida.
--   • Editar un mensaje en Telegram deshace lo que registró y aplica el texto
--     nuevo.
-- La salida ahora guarda qué lotes cerró y qué registros creó, para poder
-- deshacerla exacta.
--
-- Requiere BOLO-10, 11 y 12. Idempotente.

-- ─── Estado "deshecho" en los mensajes ─────────────────────────────────
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.produccion_pendientes'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) like '%estado%'
  loop
    execute format('alter table public.produccion_pendientes drop constraint %I', c);
  end loop;
  alter table public.produccion_pendientes add constraint produccion_pendientes_estado_check
    check (estado in ('pendiente', 'aprobado', 'descartado', 'aplicado', 'rechazado', 'deshecho'));
end $$;

-- ─── Salida: igual que en BOLO-10, devolviendo lo necesario para deshacer ─
create or replace function public._prod_salida(
  p_insumo uuid, p_procesado numeric, p_responsable text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
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
end $$;

-- ─── Pérdida: de EN USO primero (si el insumo lo usa), luego almacén ────
create or replace function public._prod_perdida(
  p_insumo uuid, p_cantidad numeric, p_motivo text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
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
end $$;

-- ─── Devolución: de EN USO al almacén (no para lo que se procesa) ──────
create or replace function public._prod_devolucion(
  p_insumo uuid, p_cantidad numeric
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.insumos;
begin
  if p_cantidad is null or p_cantidad <= 0 then
    return jsonb_build_object('ok', false, 'tipo', 'devolucion', 'error', 'cantidad');
  end if;
  select * into r from public.insumos where id = p_insumo for update;
  if not found then return jsonb_build_object('ok', false, 'tipo', 'devolucion', 'error', 'insumo'); end if;
  if coalesce(r.se_procesa, false) then
    return jsonb_build_object('ok', false, 'tipo', 'devolucion', 'error', 'procesado',
      'insumo_id', p_insumo, 'nombre', r.nombre, 'unidad_base', r.unidad_base);
  end if;
  if p_cantidad > coalesce(r.stock_procesado, 0) + 0.00005 then
    return jsonb_build_object('ok', false, 'tipo', 'devolucion', 'error', 'mas_que_en_uso',
      'insumo_id', p_insumo, 'nombre', r.nombre, 'unidad_base', r.unidad_base,
      'cantidad', p_cantidad, 'en_uso', coalesce(r.stock_procesado, 0));
  end if;
  perform set_config('bolo.motivo', 'devolucion_almacen', true);
  update public.insumos
     set stock_procesado = coalesce(stock_procesado, 0) - p_cantidad,
         stock_actual = coalesce(stock_actual, 0) + p_cantidad
   where id = p_insumo;
  return jsonb_build_object(
    'ok', true, 'tipo', 'devolucion', 'insumo_id', p_insumo, 'nombre', r.nombre, 'unidad_base', r.unidad_base,
    'cantidad', p_cantidad);
end $$;

-- ─── Aplicar: suma pérdida y devolución ────────────────────────────────
create or replace function public._prod_aplicar(
  p_pendiente uuid, p_acciones jsonb, p_responsable text, p_origen text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare a jsonb; res jsonb := '[]'::jsonb; r jsonb; r1 jsonb; v_ins uuid; hubo_ok boolean := false;
begin
  for a in select * from jsonb_array_elements(coalesce(p_acciones, '[]'::jsonb)) loop
    v_ins := nullif(a ->> 'insumo_id', '')::uuid;
    case a ->> 'tipo'
      when 'entrada' then
        r := public._prod_entrada(v_ins, (a ->> 'crudo')::numeric, p_responsable, p_origen, p_pendiente);
        -- La entrada que faltaba: registra las salidas que se habían rechazado.
        if (r ->> 'ok')::boolean then
          r := r || jsonb_build_object('corregidos', public._prod_corregir_salidas(v_ins, p_pendiente, p_responsable));
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
end $$;

-- ─── Deshacer lo que registró un mensaje ───────────────────────────────
create or replace function public._prod_deshacer(p_pendiente uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare p public.produccion_pendientes; e jsonb; l jsonb; v_ins uuid; v_c numeric;
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
        delete from public.procesamientos_abiertos where id = (e ->> 'lote_id')::uuid;
        if not found then
          raise exception 'La entrada de % ya tiene su salida registrada: deshaz primero la salida.', e ->> 'nombre';
        end if;
        update public.insumos set stock_actual = coalesce(stock_actual, 0) + (e ->> 'crudo')::numeric where id = v_ins;
      when 'salida', 'completo' then
        if e ->> 'proc_id' is null then
          raise exception 'Ese registro es anterior a esta función y no se puede deshacer desde Telegram; corrígelo desde Bolo.';
        end if;
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
end $$;

create or replace function public.telegram_deshacer(p_secreto text, p_chat bigint, p_message_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare c public.produccion_telegram; v_id uuid; v_res jsonb;
begin
  select * into c from public.produccion_telegram where id = 1;
  if c.id is null or c.secreto is null or p_secreto is distinct from c.secreto then
    raise exception 'no autorizado';
  end if;
  select id into v_id from public.produccion_pendientes where chat_id = p_chat and message_id = p_message_id;
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
end $$;

-- ─── Mensaje editado en Telegram ───────────────────────────────────────
create or replace function public.telegram_editar(p_secreto text, p_update jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
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
end $$;

-- ─── telegram_recibir_interno: suma "deshacer" respondiendo a un mensaje ─
create or replace function public.telegram_recibir_interno(p_secreto text, p_update jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
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
    'message_id', (m ->> 'message_id')::bigint, 'token', c.bot_token, 'chat_id', chat);
end;
$$;

-- ─── Permisos ──────────────────────────────────────────────────────────
revoke execute on function public._prod_salida(uuid, numeric, text) from public, anon, authenticated;
revoke execute on function public._prod_perdida(uuid, numeric, text) from public, anon, authenticated;
revoke execute on function public._prod_devolucion(uuid, numeric) from public, anon, authenticated;
revoke execute on function public._prod_aplicar(uuid, jsonb, text, text) from public, anon, authenticated;
revoke execute on function public._prod_deshacer(uuid) from public, anon, authenticated;
revoke execute on function public.telegram_recibir_interno(text, jsonb) from public, anon, authenticated;
grant execute on function public.telegram_deshacer(text, bigint, bigint) to anon, authenticated;
grant execute on function public.telegram_editar(text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
