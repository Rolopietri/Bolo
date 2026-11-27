-- Aserciones locales para cocina-zzzz-arreglos-qa.sql
\set ON_ERROR_STOP on

do $$
declare
  v_ins uuid := '9ded3133-2a4b-438a-b8a4-2f8b4ee771e6';
  v_uso jsonb;
  v_mov uuid;
  v_act numeric;
  v_proc numeric;
  n int;
  v_pend uuid;
  v_res jsonb;
  v_a uuid := gen_random_uuid();
  v_b uuid := gen_random_uuid();
  v_c1 uuid := gen_random_uuid();
  v_c2 uuid := gen_random_uuid();
  v_pen_f date;
  v_pen_c numeric;
  v_precio numeric;
  v_def text;
  v_ok boolean;
  v_menaje uuid := gen_random_uuid();
begin
  -- 1. Acentos en definiciones vivas reescritas
  v_def := pg_get_functiondef('public.telegram_deshacer(text,bigint,bigint)'::regprocedure);
  if v_def not like '%«deshacer»%' or v_def not like '%¿Respondieron%' then
    raise exception 'acentos rotos en telegram_deshacer';
  end if;
  v_def := pg_get_functiondef('public._prod_exigir_en_uso(uuid,numeric,text,text)'::regprocedure);
  if v_def not like '%Ya se usó%' then
    raise exception 'acentos rotos en _prod_exigir_en_uso';
  end if;

  -- 2. _prod_uso descuenta almacén, suma en uso y deja movimiento
  insert into public.insumos (id, nombre, unidad_base, stock_actual, stock_procesado, se_procesa, se_usa_por_lotes)
  values (v_ins, 'QA PAN DE SANDUCHE', 'unidad', 27, 6, false, true);

  v_uso := public._prod_uso(v_ins, 12);
  if not coalesce((v_uso ->> 'ok')::boolean, false) then
    raise exception '_prod_uso falló: %', v_uso;
  end if;
  v_mov := (v_uso ->> 'mov_id')::uuid;
  if v_mov is null then
    raise exception '_prod_uso no devolvió mov_id';
  end if;
  select stock_actual, stock_procesado into v_act, v_proc from public.insumos where id = v_ins;
  if v_act is distinct from 15 or v_proc is distinct from 18 then
    raise exception 'stock inesperado tras uso: actual=% procesado=% (esperado 15/18)', v_act, v_proc;
  end if;
  select count(*) into n from public.stock_movimientos where id = v_mov and tipo = 'en_uso' and cantidad = -12;
  if n <> 1 then
    raise exception 'no quedó el movimiento en_uso de -12';
  end if;

  -- No alcanza: rechaza y no toca stock ni agrega otro movimiento
  begin
    perform public._prod_uso(v_ins, 20);
    raise exception 'debería haber rechazado uso de 20 sobre 15';
  exception
    when others then
      if sqlerrm not like 'BOLO_STOCK_NEGATIVO|%' then
        raise exception 'error inesperado al rechazar uso: %', sqlerrm;
      end if;
  end;
  select stock_actual, stock_procesado into v_act, v_proc from public.insumos where id = v_ins;
  if v_act is distinct from 15 or v_proc is distinct from 18 then
    raise exception 'el rechazo no debió mover stock: % / %', v_act, v_proc;
  end if;

  -- 3. Deshacer el uso restaura stock y borra el movimiento
  insert into public.produccion_pendientes (id, chat_id, message_id, estado, resultado, enviado_at)
  values (
    gen_random_uuid(), 1, 1001, 'aplicado',
    jsonb_build_array(v_uso),
    now()
  )
  returning id into v_pend;
  perform public._prod_deshacer(v_pend);
  select stock_actual, stock_procesado into v_act, v_proc from public.insumos where id = v_ins;
  if v_act is distinct from 27 or v_proc is distinct from 6 then
    raise exception 'deshacer uso no restauró stock: % / %', v_act, v_proc;
  end if;
  select count(*) into n from public.stock_movimientos where id = v_mov;
  if n <> 0 then
    raise exception 'deshacer uso no borró el movimiento';
  end if;

  -- 4. deshacer sobre pregunta pendiente de cantidad la cancela
  insert into public.produccion_pendientes (id, chat_id, message_id, estado, resultado, enviado_at)
  values (
    gen_random_uuid(), 1, 2001, 'rechazado',
    jsonb_build_object('sin_cantidad', jsonb_build_array(
      jsonb_build_object('movimiento', 'salida', 'nombre', 'QA PAN DE SANDUCHE')
    )),
    now()
  )
  returning id into v_pend;
  insert into public.telegram_respuestas (chat_id, bot_message_id, pendiente_id)
  values (1, 2002, v_pend);
  v_res := public.telegram_deshacer('test-secreto', 1, 2002);
  if v_res ->> 'ok' is distinct from 'true'
     or v_res ->> 'cancelo_pregunta' is distinct from 'true'
     or v_res ->> 'movimiento' is distinct from 'salida' then
    raise exception 'cancelar pregunta: %', v_res;
  end if;
  if (select estado from public.produccion_pendientes where id = v_pend) is distinct from 'descartado' then
    raise exception 'la pregunta no quedó descartada';
  end if;
  if not coalesce(((select resultado from public.produccion_pendientes where id = v_pend) ->> 'cancelado')::boolean, false) then
    raise exception 'la pregunta no quedó marcada cancelado';
  end if;

  -- 5. deshacer sobre un rechazado sin pregunta sigue avisando que no hay movimientos
  insert into public.produccion_pendientes (id, chat_id, message_id, estado, resultado, enviado_at)
  values (gen_random_uuid(), 1, 3001, 'rechazado', '{}'::jsonb, now());
  v_res := public.telegram_deshacer('test-secreto', 1, 3001);
  if coalesce((v_res ->> 'ok')::boolean, true)
     or v_res ->> 'motivo' not like '%no tiene movimientos registrados%' then
    raise exception 'rechazado sin pregunta debería fallar: %', v_res;
  end if;

  -- 6. N5: al editar la última compra se recalcula penultima_*
  insert into public.insumos (id, nombre, stock_actual, cantidad_por_compra, precio_compra_usd)
  values (v_a, 'Insumo A', 10, 1, 5), (v_b, 'Insumo B', 0, 1, null);
  insert into public.compras (id, insumo_id, fecha, cantidad, precio_total_usd, costo_usd, created_at)
  values
    (v_c1, v_a, '2026-10-01', 2, 8, 8, '2026-10-01 12:00:00-04'),
    (v_c2, v_a, '2026-11-01', 3, 15, 15, '2026-11-01 12:00:00-04');
  perform public.reemplazar_compra(
    v_c2, v_a, null, '2026-11-02', 4, 20, null, null, null, null, null, null, true, null, null, null, null, 20
  );
  select penultima_fecha, penultima_cantidad, ultima_cantidad, precio_compra_usd
    into v_pen_f, v_pen_c, v_act, v_precio
    from public.insumos where id = v_a;
  if v_pen_f is distinct from date '2026-10-01' or v_pen_c is distinct from 2 then
    raise exception 'N5 penultima mal: % %', v_pen_f, v_pen_c;
  end if;
  if v_act is distinct from 4 or v_precio is distinct from 5 then -- 20/4 = 5
    raise exception 'N5 ultima mal: cant=% precio=%', v_act, v_precio;
  end if;

  -- N4: mover la única compra que le queda a A hacia B; A conserva su precio
  -- (tras el edit, A tiene dos compras; borramos c1 simulando que al cambiar
  -- de insumo c2 se va a B... reemplazar_compra mueve c2 a B, A se queda con c1.
  -- Para N4 hay que dejar a A sin compras: movemos también... mejor insertamos
  -- C en B y cambiamos la última compra de un insumo C que solo tiene una.)
  -- Rehacemos con un insumo que solo tiene una compra y la pasamos a B.
  -- A todavía tiene c1. Creamos C con una sola compra y la movemos a B.
  -- Simpler: delete c1 after? That would use delete trigger we don't have.
  -- Call reemplazar_compra on c1 moving it to B; A remains with no compras
  -- after c2 already moved? Wait c2 is still on A. Move both:
  perform public.reemplazar_compra(
    v_c1, v_b, null, '2026-10-01', 2, 8, null, null, null, null, null, null, true, null, null, null, null, 8
  );
  -- A still has c2. Move c2 too.
  select precio_compra_usd into v_precio from public.insumos where id = v_a;
  perform public.reemplazar_compra(
    v_c2, v_b, null, '2026-11-02', 4, 20, null, null, null, null, null, null, true, null, null, null, null, 20
  );
  select precio_compra_usd, ultima_fecha into v_precio, v_pen_f from public.insumos where id = v_a;
  if v_precio is null then
    raise exception 'N4 no debió anular el precio de A al quedarse sin compras (precio=%)', v_precio;
  end if;

  -- 7. menaje: no recorta a 0 en silencio
  insert into public.menaje_items (id, nombre, cantidad_actual) values (v_menaje, 'Cucharón', 2);
  begin
    perform public.ajustar_menaje_stock(v_menaje, -5);
    raise exception 'menaje debería rechazar';
  exception
    when others then
      if sqlerrm not like 'No hay suficiente menaje%' then
        raise exception 'error inesperado menaje: %', sqlerrm;
      end if;
  end;
  if (select cantidad_actual from public.menaje_items where id = v_menaje) is distinct from 2 then
    raise exception 'menaje no debió cambiar';
  end if;

  raise notice 'OK arreglos QA';
end;
$$;
