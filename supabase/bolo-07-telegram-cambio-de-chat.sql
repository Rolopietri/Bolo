-- ═══════════════════════════════════════════════════════════════════
-- BOLO-07 · Telegram: cambiar de chat y grupos que pasan a supergrupo
-- ═══════════════════════════════════════════════════════════════════
-- 1) El estado dice si el chat vinculado es un grupo o un chat privado, para
--    avisar en Bolo cuando quedó vinculado por error al chat con el bot.
-- 2) Cuando un grupo se convierte en supergrupo (pasa al dar administradores),
--    Telegram le cambia el número; Bolo sigue al grupo en vez de perderlo.
-- Requiere BOLO-06. No borra datos. Idempotente.

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
       'activo', activo)
     from produccion_telegram where id = 1),
    jsonb_build_object('configurado', false));
$$;

create or replace function public.telegram_recibir(p_secreto text, p_update jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c produccion_telegram;
  m jsonb;
  txt text;
  foto text;
  chat bigint;
  nombre text;
begin
  select * into c from produccion_telegram where id = 1;
  if c.id is null or c.secreto is null or p_secreto is distinct from c.secreto then
    return jsonb_build_object('accion', 'rechazado');
  end if;
  m := p_update -> 'message';
  if m is null then return jsonb_build_object('accion', 'ignorado'); end if;
  chat := (m -> 'chat' ->> 'id')::bigint;
  txt := coalesce(m ->> 'text', m ->> 'caption');

  -- El grupo vinculado pasó a supergrupo: seguirlo con su número nuevo.
  if m ? 'migrate_to_chat_id' and chat = c.chat_id then
    update produccion_telegram set chat_id = (m ->> 'migrate_to_chat_id')::bigint, actualizado = now() where id = 1;
    return jsonb_build_object('accion', 'migrado');
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
  -- Solo mensajes con foto o con algún número (lo demás es conversación).
  if foto is null and (txt is null or txt !~ '\d') then
    return jsonb_build_object('accion', 'ignorado');
  end if;

  nombre := nullif(btrim(coalesce(m -> 'from' ->> 'first_name', '') || ' ' || coalesce(m -> 'from' ->> 'last_name', '')), '');
  insert into produccion_pendientes (chat_id, message_id, enviado_at, remitente, texto, foto_file_id)
  values (chat, (m ->> 'message_id')::bigint, to_timestamp((m ->> 'date')::bigint), nombre, txt, foto)
  on conflict (chat_id, message_id) do nothing;
  return jsonb_build_object('accion', 'guardado');
end;
$$;

revoke execute on function public.telegram_estado() from public, anon;
grant execute on function public.telegram_estado() to authenticated;
grant execute on function public.telegram_recibir(text, jsonb) to anon, authenticated;
