-- ═══════════════════════════════════════════════════════════════════
-- BOLO-14 · Telegram: correcciones y deshacer más claros
-- ═══════════════════════════════════════════════════════════════════
-- 1. La entrada que faltaba corrige la salida rechazada MÁS RECIENTE de ese
--    insumo (antes tomaba la más vieja de las últimas 24 h).
-- 2. Deshacer una entrada que hizo una corrección deshace también esa salida
--    corregida, todo de una vez.
-- 3. Responder "deshacer" a un mensaje del bot (por ejemplo el
--    "✓ Corregido…") deshace el mensaje al que ese aviso respondía.
--
-- Requiere BOLO-13. Idempotente.

-- ─── 1. Corrección: la salida rechazada más reciente ───────────────────
create or replace function public._prod_corregir_salidas(p_insumo uuid, p_actual uuid, p_responsable text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare p record; e record; arr jsonb; r jsonb; hechos jsonb := '[]'::jsonb;
begin
  for p in
    select id, resultado from public.produccion_pendientes
     where id is distinct from p_actual
       and enviado_at > now() - interval '24 hours'
       and jsonb_typeof(resultado) = 'array'
       and exists (
         select 1 from jsonb_array_elements(resultado) x
          where (x ->> 'ok')::boolean = false and x ->> 'tipo' = 'salida'
            and x ->> 'error' in ('sin_entrada', 'mas_que_entrada') and x ->> 'insumo_id' = p_insumo::text)
     order by enviado_at desc
     for update
  loop
    arr := '[]'::jsonb;
    for e in select x, ord from jsonb_array_elements(p.resultado) with ordinality as t(x, ord) order by ord loop
      if (e.x ->> 'ok')::boolean = false and e.x ->> 'tipo' = 'salida'
         and e.x ->> 'error' in ('sin_entrada', 'mas_que_entrada') and e.x ->> 'insumo_id' = p_insumo::text then
        r := public._prod_salida(p_insumo, (e.x ->> 'procesado')::numeric, p_responsable);
        if (r ->> 'ok')::boolean then
          r := r || jsonb_build_object('corregido', true, 'pendiente_id', p.id);
          hechos := hechos || jsonb_build_array(r);
          arr := arr || jsonb_build_array(r);
        else
          arr := arr || jsonb_build_array(e.x);
        end if;
      else
        arr := arr || jsonb_build_array(e.x);
      end if;
    end loop;
    update public.produccion_pendientes
       set resultado = arr,
           estado = case when exists (select 1 from jsonb_array_elements(arr) y where (y ->> 'ok')::boolean)
                         then 'aplicado' else estado end,
           aplicado_at = now()
     where id = p.id;
    -- Una entrada cierra su lote con la primera salida: no hay más que corregir.
    exit when jsonb_array_length(hechos) > 0;
  end loop;
  return hechos;
end $$;

-- ─── 2. Deshacer: la entrada arrastra la salida que corrigió ───────────
create or replace function public._prod_deshacer(p_pendiente uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
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

-- ─── 3. Respuestas del bot → mensaje al que respondían ─────────────────
create table if not exists public.telegram_respuestas (
  chat_id        bigint not null,
  bot_message_id bigint not null,
  pendiente_id   uuid not null references public.produccion_pendientes(id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (chat_id, bot_message_id)
);
alter table public.telegram_respuestas enable row level security;

create or replace function public.telegram_guardar_respuesta(
  p_secreto text, p_chat bigint, p_bot_message_id bigint, p_pendiente uuid
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare c public.produccion_telegram;
begin
  select * into c from public.produccion_telegram where id = 1;
  if c.id is null or c.secreto is null or p_secreto is distinct from c.secreto then
    raise exception 'no autorizado';
  end if;
  insert into public.telegram_respuestas (chat_id, bot_message_id, pendiente_id)
  values (p_chat, p_bot_message_id, p_pendiente)
  on conflict (chat_id, bot_message_id) do update set pendiente_id = excluded.pendiente_id;
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
end $$;

revoke execute on function public._prod_corregir_salidas(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public._prod_deshacer(uuid) from public, anon, authenticated;
grant execute on function public.telegram_guardar_respuesta(text, bigint, bigint, uuid) to anon, authenticated;
grant execute on function public.telegram_deshacer(text, bigint, bigint) to anon, authenticated;

notify pgrst, 'reload schema';
