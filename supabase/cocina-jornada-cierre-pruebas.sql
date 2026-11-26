-- Pruebas de supabase/cocina-jornada-cierre.sql
-- NO correr en producción. Las lanza scripts/probar-jornada-cierre.sh
-- en una base local descartable.

create or replace function public._assert(p_ok boolean, p_msg text)
returns void language plpgsql as $$
begin
  if not p_ok then
    raise exception 'FALLO: %', p_msg;
  end if;
end;
$$;

do $pruebas$
declare
  v_ins_a uuid := '11111111-1111-1111-1111-111111111111';
  v_ins_b uuid := '22222222-2222-2222-2222-222222222222';
  v_j1 uuid;
  v_j2 uuid;
  v_j3 uuid;
  v_cierre uuid;
  v_cierre2 uuid;
  v_n int;
  v_origen text;
  v_hab numeric;
  v_viene numeric;
  v_esta numeric;
  v_pend numeric;
  v_lotes int;
  v_foto numeric;
  v_tz text;
  v_ini timestamptz;
begin
  -- 1. Tras la migración hay una jornada abierta con foto de apertura.
  select count(*) into v_n from public.cocina_jornadas where cerrado_at is null;
  perform public._assert(v_n = 1, 'debe haber exactamente una jornada abierta al inicio');
  select id into v_j1 from public.cocina_jornadas where cerrado_at is null;
  select stock_procesado into v_foto
    from public.cocina_jornada_saldos
   where jornada_id = v_j1 and insumo_id = v_ins_a and momento = 'apertura';
  perform public._assert(v_foto = 10, format('foto apertura A debía ser 10, fue %s', v_foto));

  -- 2. Sube en uso: se acumula como habilitado en esta jornada.
  update public.insumos set stock_procesado = 15, stock_actual = 5 where id = v_ins_a;
  select procesado_habilitado into v_hab
    from public.cocina_jornada_saldos
   where jornada_id = v_j1 and insumo_id = v_ins_a and momento = 'apertura';
  perform public._assert(v_hab = 5, format('habilitado debía ser 5, fue %s', v_hab));

  -- 3. Baja por venta (sin motivo de deshacer): el habilitado no cambia.
  --    FIFO: apertura 10 + hab 5 - actual 12 = 3 salidas → viene 7, esta 5.
  update public.insumos set stock_procesado = 12 where id = v_ins_a;
  select procesado_habilitado into v_hab
    from public.cocina_jornada_saldos
   where jornada_id = v_j1 and insumo_id = v_ins_a and momento = 'apertura';
  perform public._assert(v_hab = 5, format('habilitado no debía bajar por venta, fue %s', v_hab));
  select viene_de_anterior, habilitado_esta
    into v_viene, v_esta
    from public.cocina_tablero_en_uso()
   where insumo_id = v_ins_a;
  perform public._assert(v_viene = 7, format('viene_de_anterior debía ser 7, fue %s', v_viene));
  perform public._assert(v_esta = 5, format('habilitado_esta debía ser 5, fue %s', v_esta));

  -- 4. INSERT de cierre_caja cierra la jornada y abre la siguiente.
  insert into public.cierre_caja (id, fecha)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-11-26')
  returning id into v_cierre;

  select count(*) into v_n from public.cocina_jornadas;
  perform public._assert(v_n = 2, format('tras el cierre deben haber 2 jornadas, hay %s', v_n));
  select origen into v_origen from public.cocina_jornadas where id = v_j1;
  perform public._assert(v_origen = 'cierre_caja', format('origen debía ser cierre_caja, fue %s', v_origen));
  select stock_procesado into v_foto
    from public.cocina_jornada_saldos
   where jornada_id = v_j1 and insumo_id = v_ins_a and momento = 'cierre';
  perform public._assert(v_foto = 12, format('foto de cierre A debía ser 12, fue %s', v_foto));
  select id into v_j2 from public.cocina_jornadas where cerrado_at is null;
  perform public._assert(v_j2 is not null and v_j2 <> v_j1, 'debe abrirse una jornada nueva');
  select stock_procesado, procesado_habilitado into v_foto, v_hab
    from public.cocina_jornada_saldos
   where jornada_id = v_j2 and insumo_id = v_ins_a and momento = 'apertura';
  perform public._assert(v_foto = 12, format('apertura de la nueva debía ser 12, fue %s', v_foto));
  perform public._assert(v_hab = 0, format('habilitado de la nueva debía ser 0, fue %s', v_hab));

  -- En la jornada nueva, todo lo actual es «viene de anterior».
  select viene_de_anterior, habilitado_esta
    into v_viene, v_esta
    from public.cocina_tablero_en_uso()
   where insumo_id = v_ins_a;
  perform public._assert(v_viene = 12 and v_esta = 0,
    format('tras el cierre, tablero A debía ser 12/0, fue %s/%s', v_viene, v_esta));

  -- 5. UPDATE del mismo cierre no duplica jornadas.
  update public.cierre_caja set nota = 'editado' where id = v_cierre;
  select count(*) into v_n from public.cocina_jornadas;
  perform public._assert(v_n = 2, format('editar el cierre no debe crear jornadas, hay %s', v_n));

  -- 6. Cerrar otra vez con el mismo id es no-op.
  perform public._cocina_jornada_cerrar('cierre_caja', v_cierre, '2026-11-26');
  select count(*) into v_n from public.cocina_jornadas;
  perform public._assert(v_n = 2, format('cerrar con el mismo id no debe duplicar, hay %s', v_n));

  -- 7. Borrar y volver a guardar la misma fecha revincula, no cierra la jornada nueva.
  delete from public.cierre_caja where id = v_cierre;
  select cierre_caja_id, cierre_caja_fecha into v_cierre2, v_origen
    from public.cocina_jornadas where id = v_j1;
  -- v_origen aquí lo reusé mal; reviso fecha y id por separado
  perform public._assert(
    (select cierre_caja_id from public.cocina_jornadas where id = v_j1) is null,
    'al borrar el cierre, cierre_caja_id debe quedar null');
  perform public._assert(
    (select cierre_caja_fecha from public.cocina_jornadas where id = v_j1) = '2026-11-26',
    'la fecha del cierre debe conservarse');

  insert into public.cierre_caja (id, fecha)
  values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '2026-11-26')
  returning id into v_cierre2;
  perform public._assert(
    (select cierre_caja_id from public.cocina_jornadas where id = v_j1) = v_cierre2,
    'al volver a guardar esa fecha se revincula el id');
  select count(*) into v_n from public.cocina_jornadas;
  perform public._assert(v_n = 2, format('reinsertar no debe cerrar otra vez, hay %s jornadas', v_n));
  perform public._assert(
    (select id from public.cocina_jornadas where cerrado_at is null) = v_j2,
    'la jornada abierta debe seguir siendo la misma');

  -- 8. Lote abierto antes del inicio de la jornada abierta = pendiente.
  insert into public.procesamientos_abiertos (insumo_id, crudo, abierto_at)
  values (v_ins_b, 3, now() - interval '2 days');
  select pendientes_abiertos, lotes_pendientes into v_pend, v_lotes
    from public.cocina_tablero_en_uso()
   where insumo_id = v_ins_b;
  perform public._assert(v_pend = 3 and v_lotes = 1,
    format('pendientes B debía ser 3/1, fue %s/%s', v_pend, v_lotes));

  -- 9. Respaldo: jornada empezada ayer, ya pasó la hora de corte → cierra.
  update public.cocina_jornadas
     set iniciado_at = now() - interval '30 hours'
   where id = v_j2;
  v_j3 := public._cocina_jornada_respaldo();
  perform public._assert(v_j3 = v_j2, 'el respaldo debía cerrar la jornada abierta de ayer');
  perform public._assert(
    (select origen from public.cocina_jornadas where id = v_j2) = 'respaldo',
    'origen debía ser respaldo');
  select count(*) into v_n from public.cocina_jornadas where cerrado_at is null;
  perform public._assert(v_n = 1, 'tras el respaldo debe quedar una jornada abierta');

  -- 10. Segundo respaldo: la nueva empezó ahora (después de medianoche) → no-op.
  perform public._assert(public._cocina_jornada_respaldo() is null,
    'un segundo respaldo no debe cerrar la jornada recién abierta');
  select count(*) into v_n from public.cocina_jornadas;
  perform public._assert(v_n = 3, format('deben quedar 3 jornadas, hay %s', v_n));

  -- 11. Jornada nacida de madrugada (después de medianoche local) no la corta el respaldo.
  v_tz := public._cocina_zona_horaria();
  v_ini := timezone(v_tz, date_trunc('day', timezone(v_tz, now())) + time '03:00');
  if v_ini > now() then
    -- Si todavía no son las 3:00 locales, usa un minuto después de medianoche.
    v_ini := timezone(v_tz, date_trunc('day', timezone(v_tz, now())) + interval '1 minute');
  end if;
  if v_ini <= now() then
    update public.cocina_jornadas
       set iniciado_at = v_ini
     where cerrado_at is null;
    perform public._assert(public._cocina_jornada_respaldo() is null,
      'una jornada empezada hoy de madrugada no se cierra por respaldo');
  end if;

  raise notice 'OK: todas las pruebas de jornada de cocina pasaron';
end;
$pruebas$;
