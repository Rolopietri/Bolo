-- ═══════════════════════════════════════════════════════════════════
-- BOLO-11 · Telegram: resumen diario al gerente, en privado
-- ═══════════════════════════════════════════════════════════════════
-- El grupo ya no recibe confirmaciones de lo que se registró bien (solo los
-- rechazos, para corregir en el momento). Lo registrado se resume una vez al
-- día y el bot se lo manda en privado al gerente.
--
-- Para recibirlo, el gerente abre el chat privado con el bot y escribe
-- "/gerente CODIGO" (el mismo código de vincular que muestra Bolo). Desde ese
-- chat también puede pedir "/resumen" en cualquier momento.
--
-- Requiere BOLO-06, BOLO-07 y BOLO-10. Aditivo e idempotente.

alter table public.produccion_telegram add column if not exists resumen_chat_id bigint;
alter table public.produccion_telegram add column if not exists resumen_nombre text;

-- ─── Estado (sin el token) ─────────────────────────────────────────────
create or replace function public.telegram_estado()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(
    (select jsonb_build_object(
       'configurado', bot_token is not null,
       'bot_usuario', bot_usuario,
       'codigo', codigo,
       'vinculado', chat_id is not null,
       'privado', chat_id is not null and chat_id > 0,
       'chat_titulo', chat_titulo,
       'activo', activo,
       'ultimo_aviso_at', ultimo_aviso_at,
       'ultimo_aviso_chat', ultimo_aviso_chat,
       'ultimo_aviso_tipo', ultimo_aviso_tipo,
       'ultima_accion', ultima_accion,
       'resumen_nombre', resumen_nombre,
       'resumen_activo', resumen_chat_id is not null)
     from produccion_telegram where id = 1),
    jsonb_build_object('configurado', false));
$$;

-- Dejar de enviar el resumen (desde Bolo).
create or replace function public.telegram_quitar_gerente()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update produccion_telegram set resumen_chat_id = null, resumen_nombre = null, actualizado = now() where id = 1;
  return telegram_estado();
end $$;

-- ─── telegram_recibir_interno: suma el chat privado del gerente ────────
-- Igual que en BOLO-10, más tres órdenes en chat privado con el bot:
-- /start (instrucciones), /gerente CODIGO (recibir el resumen) y /resumen.
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

  if jsonb_typeof(m -> 'photo') = 'array' then
    foto := m -> 'photo' -> (jsonb_array_length(m -> 'photo') - 1) ->> 'file_id';
  elsif (m -> 'document' ->> 'mime_type') like 'image/%' then
    foto := m -> 'document' ->> 'file_id';
  end if;
  if foto is null and (txt is null or txt !~ '\d') then
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

-- ─── Datos del resumen de un día (hora de Caracas) ─────────────────────
create or replace function public._telegram_resumen_datos(p_fecha date)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  with dia as (
    select (p_fecha::timestamp at time zone 'America/Caracas') as desde,
           ((p_fecha + 1)::timestamp at time zone 'America/Caracas') as hasta
  )
  select jsonb_build_object(
    'fecha', p_fecha,
    -- Movimientos registrados desde el grupo (entradas y usos por unidad).
    'mensajes', coalesce((
      select jsonb_agg(jsonb_build_object('remitente', p.remitente, 'resultado', p.resultado, 'enviado_at', p.enviado_at)
                       order by p.enviado_at)
        from produccion_pendientes p, dia
       where p.estado = 'aplicado' and p.enviado_at >= dia.desde and p.enviado_at < dia.hasta), '[]'::jsonb),
    -- Procesamientos cerrados ese día (desde el grupo o desde la app).
    'procesados', coalesce((
      select jsonb_agg(jsonb_build_object('nombre', i.nombre, 'unidad_base', i.unidad_base, 'crudo', pr.crudo,
                                          'procesado', pr.procesado, 'merma_porc', pr.merma_porc,
                                          'estandar', i.merma_coccion_porc, 'responsable', pr.responsable,
                                          'nota', pr.nota)
                       order by pr.created_at)
        from procesamientos pr join insumos i on i.id = pr.insumo_id
       where pr.fecha = p_fecha), '[]'::jsonb),
    -- Lo que sigue en la mesa al momento del resumen.
    'abiertos', coalesce((
      select jsonb_agg(jsonb_build_object('nombre', i.nombre, 'unidad_base', i.unidad_base, 'crudo', a.crudo,
                                          'responsable', a.responsable, 'abierto_at', a.abierto_at)
                       order by a.abierto_at)
        from procesamientos_abiertos a join insumos i on i.id = a.insumo_id), '[]'::jsonb),
    'rechazados', coalesce((
      select jsonb_agg(jsonb_build_object('remitente', p.remitente, 'texto', p.texto) order by p.enviado_at)
        from produccion_pendientes p, dia
       where p.estado = 'rechazado' and p.enviado_at >= dia.desde and p.enviado_at < dia.hasta), '[]'::jsonb),
    'avisos_pendientes', (select count(*) from avisos_inventario where estado = 'pendiente'),
    'fotos_pendientes', (select count(*) from produccion_pendientes where estado = 'pendiente' and foto_file_id is not null)
  )
  from dia;
$$;

-- Para el bot (orden /resumen en el chat privado): valida la clave secreta.
create or replace function public.telegram_resumen_secreto(p_secreto text, p_fecha date)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare c produccion_telegram;
begin
  select * into c from produccion_telegram where id = 1;
  if c.id is null or c.secreto is null or p_secreto is distinct from c.secreto then
    raise exception 'no autorizado';
  end if;
  return jsonb_build_object('token', c.bot_token, 'chat_id', c.resumen_chat_id,
                            'datos', public._telegram_resumen_datos(p_fecha));
end $$;

-- Para el envío automático diario (servidor con llave de servicio).
create or replace function public.telegram_resumen_servicio(p_fecha date)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare c produccion_telegram;
begin
  select * into c from produccion_telegram where id = 1;
  if c.id is null or c.bot_token is null or c.resumen_chat_id is null then
    return jsonb_build_object('chat_id', null);
  end if;
  return jsonb_build_object('token', c.bot_token, 'chat_id', c.resumen_chat_id,
                            'datos', public._telegram_resumen_datos(p_fecha));
end $$;

revoke execute on function public._telegram_resumen_datos(date) from public, anon, authenticated;
revoke execute on function public.telegram_recibir_interno(text, jsonb) from public, anon, authenticated;
grant execute on function public.telegram_resumen_secreto(text, date) to anon, authenticated;
revoke execute on function public.telegram_resumen_servicio(date) from public, anon, authenticated;
grant execute on function public.telegram_resumen_servicio(date) to service_role;
revoke execute on function public.telegram_estado() from public, anon;
grant execute on function public.telegram_estado() to authenticated;
revoke execute on function public.telegram_quitar_gerente() from public, anon;
grant execute on function public.telegram_quitar_gerente() to authenticated;

notify pgrst, 'reload schema';
