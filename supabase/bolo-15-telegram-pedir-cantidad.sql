-- BOLO-15 · El bot pide el peso cuando el mensaje no lo trae.
--
-- "Saliendo algo de lomito" nombra el insumo pero no dice cuánto. Desde este
-- cambio el bot pregunta "¿Cuánto QA LOMITO salió?" y, cuando le responden
-- con la cantidad ("1,2 kg"), la registra por el camino de siempre
-- (telegram_aplicar). Para saber a qué mensaje se respondió, el webhook
-- necesita leer el mensaje original: eso es lo único que agrega este archivo.
--
-- Solo AGREGA una función nueva. No reemplaza ninguna de las que ya están en
-- producción (telegram_recibir_interno, telegram_aplicar con p_responde_a,
-- _prod_aplicar, _prod_deshacer, ...) ni toca datos.
--
-- Aplicar ANTES de publicar el código del webhook de este cambio. Si el código
-- llega antes, no se rompe nada: el bot pregunta el peso, pero la respuesta
-- se trata como un mensaje nuevo (y "1,2 kg" solo se ignora).

-- Mensaje del grupo al que apunta un message_id: el mensaje mismo o, si es un
-- aviso del bot, el mensaje al que el aviso respondía (telegram_respuestas).
-- Misma búsqueda que telegram_deshacer. Devuelve null si no lo encuentra.
create or replace function public.telegram_mensaje_original(p_secreto text, p_chat bigint, p_message_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  c public.produccion_telegram;
  p public.produccion_pendientes;
  v_via text := 'mensaje';
begin
  select * into c from public.produccion_telegram where id = 1;
  if c.id is null or c.secreto is null or p_secreto is distinct from c.secreto then
    raise exception 'no autorizado';
  end if;
  if p_chat is null or p_message_id is null or p_chat is distinct from c.chat_id then
    return null;
  end if;
  select * into p from public.produccion_pendientes where chat_id = p_chat and message_id = p_message_id;
  if p.id is null then
    v_via := 'respuesta';
    select pp.* into p
      from public.telegram_respuestas tr
      join public.produccion_pendientes pp on pp.id = tr.pendiente_id
     where tr.chat_id = p_chat and tr.bot_message_id = p_message_id;
  end if;
  if p.id is null then
    return null;
  end if;
  return jsonb_build_object(
    'id', p.id,
    'texto', p.texto,
    'estado', p.estado,
    'resultado', p.resultado,
    'message_id', p.message_id,
    'enviado_at', p.enviado_at,
    'via', v_via
  );
end $$;

revoke execute on function public.telegram_mensaje_original(text, bigint, bigint) from public, anon, authenticated;
grant execute on function public.telegram_mensaje_original(text, bigint, bigint) to anon, authenticated;

notify pgrst, 'reload schema';
