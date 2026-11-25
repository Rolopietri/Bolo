-- ═══════════════════════════════════════════════════════════════════
-- BOLO-12 · Telegram: la entrada que faltaba corrige la salida rechazada
-- ═══════════════════════════════════════════════════════════════════
-- Si alguien manda "Saliendo 2 kg cebolla" sin entrada, el bot la rechaza y
-- pide cuánto entró. Cuando llega "Entrando 3 kg cebolla", Bolo registra sola
-- la salida que había rechazado (de las últimas 24 horas): el lote se cierra,
-- el mensaje rechazado pasa a "aplicado" (marcado como corregido) y ya no sale
-- en "No se registró" del resumen. Lo mismo si la salida era mayor que lo que
-- había entrado y la nueva entrada la cubre.
--
-- Requiere BOLO-10. Idempotente.

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
     order by enviado_at asc
     for update
  loop
    arr := '[]'::jsonb;
    for e in select x, ord from jsonb_array_elements(p.resultado) with ordinality as t(x, ord) order by ord loop
      if (e.x ->> 'ok')::boolean = false and e.x ->> 'tipo' = 'salida'
         and e.x ->> 'error' in ('sin_entrada', 'mas_que_entrada') and e.x ->> 'insumo_id' = p_insumo::text then
        r := public._prod_salida(p_insumo, (e.x ->> 'procesado')::numeric, p_responsable);
        if (r ->> 'ok')::boolean then
          r := r || jsonb_build_object('corregido', true);
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
  end loop;
  return hechos;
end $$;

revoke execute on function public._prod_corregir_salidas(uuid, uuid, text) from public, anon, authenticated;

-- Aplica una lista de acciones y deja el resultado en el mensaje.
-- p_acciones: [{tipo: entrada|salida|completo|uso, insumo_id, crudo?, procesado?, cantidad?}]
-- (cantidades en la unidad base del insumo).
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

revoke execute on function public._prod_aplicar(uuid, jsonb, text, text) from public, anon, authenticated;

notify pgrst, 'reload schema';
