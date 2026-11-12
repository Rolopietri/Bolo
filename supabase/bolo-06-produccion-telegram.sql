-- ═══════════════════════════════════════════════════════════════════
-- BOLO-06 · Producción desde un grupo de Telegram
-- ═══════════════════════════════════════════════════════════════════
-- Un bot de Telegram (creado por el restaurante con @BotFather, gratis) está
-- en el grupo de producción. Cada mensaje con números o foto llega a Bolo
-- como "pendiente" y solo se convierte en lotes cuando alguien lo aprueba en
-- Producción. Requiere BOLO-05.
--
-- El token del bot no se puede leer con consultas normales: la tabla no tiene
-- políticas y solo la tocan las funciones de abajo.
-- No borra datos. Idempotente: se puede correr más de una vez.

-- Configuración (una sola fila).
create table if not exists public.produccion_telegram (
  id           int primary key default 1 check (id = 1),
  bot_token    text,
  bot_usuario  text,
  -- Clave que Telegram manda en cada aviso; así se sabe que viene de él.
  secreto      text,
  -- Código para vincular el grupo: se escribe "/vincular CODIGO" en el grupo.
  codigo       text,
  chat_id      bigint,
  chat_titulo  text,
  activo       boolean not null default true,
  actualizado  timestamptz not null default now()
);
alter table public.produccion_telegram enable row level security;
revoke all on public.produccion_telegram from anon, authenticated;

-- Mensajes recibidos, por revisar.
create table if not exists public.produccion_pendientes (
  id            uuid primary key default gen_random_uuid(),
  chat_id       bigint not null,
  message_id    bigint not null,
  enviado_at    timestamptz not null,
  remitente     text,
  texto         text,
  foto_file_id  text,
  estado        text not null default 'pendiente' check (estado in ('pendiente', 'aprobado', 'descartado')),
  revisado_por  uuid,
  revisado_at   timestamptz,
  created_at    timestamptz not null default now(),
  unique (chat_id, message_id)
);
create index if not exists produccion_pendientes_estado_idx on public.produccion_pendientes (estado, enviado_at);

alter table public.produccion_pendientes enable row level security;
drop policy if exists prodp_select on public.produccion_pendientes;
drop policy if exists prodp_update on public.produccion_pendientes;
create policy prodp_select on public.produccion_pendientes for select to authenticated using (true);
create policy prodp_update on public.produccion_pendientes for update to authenticated using (true) with check (true);

-- Estado de la conexión (sin el token).
create or replace function public.telegram_estado()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(
    (select jsonb_build_object(
       'configurado', bot_token is not null,
       'bot_usuario', bot_usuario,
       'codigo', codigo,
       'vinculado', chat_id is not null,
       'chat_titulo', chat_titulo,
       'activo', activo)
     from produccion_telegram where id = 1),
    jsonb_build_object('configurado', false));
$$;

-- Guardar el bot (lo llama el servidor de Bolo después de validar el token y
-- registrar el aviso en Telegram). Genera un código nuevo de vinculación.
create or replace function public.telegram_configurar(p_token text, p_usuario text, p_secreto text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  insert into produccion_telegram (id, bot_token, bot_usuario, secreto, codigo, chat_id, chat_titulo, activo, actualizado)
  values (1, p_token, p_usuario, p_secreto, upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6)),
          null, null, true, now())
  on conflict (id) do update set
    bot_token = excluded.bot_token, bot_usuario = excluded.bot_usuario, secreto = excluded.secreto,
    codigo = excluded.codigo, chat_id = null, chat_titulo = null, activo = true, actualizado = now();
  return telegram_estado();
end;
$$;

-- Pausar / reanudar la recepción.
create or replace function public.telegram_activar(p_activo boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update produccion_telegram set activo = p_activo, actualizado = now() where id = 1;
  return telegram_estado();
end;
$$;

-- Desconectar: devuelve el token (para quitar el aviso en Telegram) y lo borra.
create or replace function public.telegram_desconectar()
returns text language plpgsql security definer set search_path = public as $$
declare t text;
begin
  select bot_token into t from produccion_telegram where id = 1;
  delete from produccion_telegram where id = 1;
  return t;
end;
$$;

-- Token para descargar las fotos del grupo (lo usa el servidor de Bolo).
create or replace function public.telegram_token()
returns text language sql stable security definer set search_path = public as $$
  select bot_token from produccion_telegram where id = 1;
$$;

-- Aviso de Telegram: valida la clave, vincula el grupo o guarda el mensaje.
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
revoke execute on function public.telegram_configurar(text, text, text) from public, anon;
revoke execute on function public.telegram_activar(boolean) from public, anon;
revoke execute on function public.telegram_desconectar() from public, anon;
revoke execute on function public.telegram_token() from public, anon;
grant execute on function public.telegram_estado() to authenticated;
grant execute on function public.telegram_configurar(text, text, text) to authenticated;
grant execute on function public.telegram_activar(boolean) to authenticated;
grant execute on function public.telegram_desconectar() to authenticated;
grant execute on function public.telegram_token() to authenticated;
-- telegram_recibir la llama Telegram (sin sesión); la protege la clave secreta.
grant execute on function public.telegram_recibir(text, jsonb) to anon, authenticated;
