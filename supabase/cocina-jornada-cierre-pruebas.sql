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
  v_limite timestamptz;
  v_base timestamptz;
  v_res jsonb;
  v_fecha date;
  v_id uuid;
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

  -- 9. Fecha de negocio = fecha civil de iniciado_at. jornada_actual / jornada_de / jornada_fecha.
  perform public._assert(
    (select fecha from public.cocina_jornadas where id = v_j1) is not null,
    'la jornada 1 debe tener fecha de negocio');
  select fecha into v_fecha from public.jornada_actual();
  perform public._assert(v_fecha = public._cocina_fecha_civil(now()),
    format('jornada_actual().fecha debía ser %s, fue %s', public._cocina_fecha_civil(now()), v_fecha));
  perform public._assert(
    (select id from public.jornada_de(now())) = (select id from public.jornada_actual()),
    'jornada_de(now()) debe ser la jornada abierta');
  perform public._assert(
    public.jornada_fecha(now()) = (select fecha from public.jornada_actual()),
    'jornada_fecha(now()) debe coincidir con la jornada abierta');

  -- 10. Horario que cruza medianoche: apertura 18:00, cierre 02:00.
  --     Jornada empezada ayer a las 18:00 → límite hoy a las 02:00.
  --     Si ya pasó esa hora, el automático cierra con origen automatico.
  v_tz := public._cocina_zona_horaria();
  update public.negocio_config
     set hora_apertura_habitual = time '18:00',
         hora_cierre_maxima = time '02:00',
         jornada_horario_nota = 'Prueba: cruza medianoche'
   where id = 1;
  v_ini := timezone(v_tz, date_trunc('day', timezone(v_tz, now())) - interval '1 day' + time '18:00');
  update public.cocina_jornadas
     set iniciado_at = v_ini,
         fecha = public._cocina_fecha_civil(v_ini)
   where id = v_j2;
  v_base := public._cocina_jornada_limite_base(v_ini, public._cocina_fecha_civil(v_ini));
  perform public._assert(v_base = timezone(v_tz, date_trunc('day', timezone(v_tz, now())) + time '02:00'),
    format('el límite base de una jornada nocturna debía ser hoy 02:00, fue %s', v_base));
  -- A estas alturas del día (después de las 02:00) el automático debe cerrar.
  -- Si la prueba corre antes de las 02:00 locales, se simula avanzando iniciado
  -- no: el límite ya es hoy 02:00; si now() < 02:00 no cierra. En ese caso
  -- comprobamos solo el límite y aplazamos el close a un caso con horario pasado.
  if now() >= v_base then
    v_j3 := public._cocina_jornada_automatico();
    perform public._assert(v_j3 = v_j2, 'el automático debía cerrar la jornada que cruzó medianoche');
    perform public._assert(
      (select origen from public.cocina_jornadas where id = v_j2) = 'automatico',
      'origen debía ser automatico');
  else
    -- Todavía no son las 02:00: no cierra, y un respaldo viejo tampoco.
    perform public._assert(public._cocina_jornada_automatico() is null,
      'antes de las 02:00 no debe cerrar');
    -- Fuerza un límite ya vencido (apertura 08:00, cierre hace una hora).
    update public.negocio_config
       set hora_apertura_habitual = time '08:00',
           hora_cierre_maxima = (timezone(v_tz, now()) - interval '1 hour')::time
     where id = 1;
    -- Si esa hora de cierre es <= 08:00, el límite cae mañana; lo evitamos
    -- usando una hora de cierre estrictamente después de las 08:00.
    if (timezone(v_tz, now()) - interval '1 hour')::time <= time '08:00' then
      update public.negocio_config
         set hora_apertura_habitual = time '00:01',
             hora_cierre_maxima = (timezone(v_tz, now()) - interval '1 hour')::time
       where id = 1;
    end if;
    update public.cocina_jornadas
       set iniciado_at = timezone(v_tz, date_trunc('day', timezone(v_tz, now())) + time '09:00'),
           fecha = public._cocina_fecha_civil(now())
     where id = v_j2
       and cerrado_at is null;
    -- Si por la hora de inicio (antes de las 09:00) el iniciado queda a futuro,
    -- usa una hora ya pasada.
    if (select iniciado_at from public.cocina_jornadas where id = v_j2) > now()
       and (select cerrado_at from public.cocina_jornadas where id = v_j2) is null then
      update public.cocina_jornadas
         set iniciado_at = now() - interval '4 hours',
             fecha = public._cocina_fecha_civil(now() - interval '4 hours')
       where id = v_j2;
    end if;
    v_j3 := public._cocina_jornada_automatico();
    perform public._assert(v_j3 = v_j2, 'el automático debía cerrar al pasar la hora máxima');
    perform public._assert(
      (select origen from public.cocina_jornadas where id = v_j2) = 'automatico',
      'origen debía ser automatico');
  end if;
  perform public._assert(
    (select count(*) from public.cocina_jornadas where cerrado_at is null) = 1,
    'tras el automático debe quedar una jornada abierta');

  -- 11. Cierre de caja posterior: se revincula a la jornada automática de esa
  --     fecha y no cierra la jornada nueva.
  -- Si esa fecha ya tiene un cierre (el de la prueba 4), se usa el día anterior
  -- para no chocar con la unique de cierre_caja ni revincular la jornada 1.
  v_fecha := (select fecha from public.cocina_jornadas where id = v_j2);
  if exists (select 1 from public.cierre_caja where fecha = v_fecha) then
    v_fecha := v_fecha - 1;
    update public.cocina_jornadas set fecha = v_fecha where id = v_j2;
  end if;
  v_id := (select id from public.cocina_jornadas where cerrado_at is null);
  insert into public.cierre_caja (id, fecha)
  values ('cccccccc-cccc-cccc-cccc-cccccccccccc', v_fecha);
  perform public._assert(
    (select cierre_caja_id from public.cocina_jornadas where id = v_j2)
      = 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'el cierre de caja posterior debía revinculirse a la jornada automática');
  perform public._assert(
    (select origen from public.cocina_jornadas where id = v_j2) = 'cierre_caja',
    'el origen pasa a cierre_caja al revinclarlo');
  perform public._assert(
    (select id from public.cocina_jornadas where cerrado_at is null) = v_id,
    'la jornada abierta no se debe cerrar por el cierre de caja posterior');

  -- 12. Posposiciones: «Recordar en 1 hora», tope de 6, la séptima falla.
  --     Límite a las 23:59 del mismo día (siempre a futuro si la prueba corre
  --     antes de esa hora; si ya pasó, se usa un inicio reciente y no se
  --     exige que el automático se abstenga).
  update public.negocio_config
     set hora_apertura_habitual = time '00:00',
         hora_cierre_maxima = time '23:59',
         jornada_horario_nota = 'Prueba: posposiciones'
   where id = 1;
  update public.cocina_jornadas
     set iniciado_at = now() - interval '2 hours',
         fecha = public._cocina_fecha_civil(now() - interval '2 hours')
   where cerrado_at is null;
  v_id := (select id from public.cocina_jornadas where cerrado_at is null);
  v_limite := public._cocina_jornada_limite_efectivo(v_id);
  perform public._assert(v_limite is not null, 'debe haber límite efectivo para posponer');
  if now() >= v_limite then
    -- Ya son las 23:59 o más: corre el día un poco hacia atrás el límite
    -- moviendo la hora de cierre a dentro de una hora (sin cruzar a <= 00:00).
    update public.negocio_config
       set hora_cierre_maxima = (timezone(v_tz, now()) + interval '1 hour')::time
     where id = 1;
    if (select hora_cierre_maxima from public.negocio_config where id = 1) <= time '00:00' then
      -- Caería mañana; no usamos posponer sobre un límite lejano. Forzamos
      -- apertura 00:00 y cierre 23:59 del día siguiente vía iniciado de ayer
      -- no aplica. En este borde se omite el assert de «aún no cierra».
      null;
    else
      v_limite := public._cocina_jornada_limite_efectivo(v_id);
    end if;
  end if;
  if now() < public._cocina_jornada_limite_efectivo(v_id) then
    perform public._assert(public._cocina_jornada_automatico() is null,
      'con el límite todavía en el futuro no debe cerrar');
  end if;
  v_limite := public._cocina_jornada_limite_efectivo(v_id);

  for v_n in 1..6 loop
    v_res := public.cocina_jornada_posponer();
    perform public._assert((v_res ->> 'ok')::boolean,
      format('la posposición %s debía ser ok: %s', v_n, v_res));
    perform public._assert((v_res ->> 'posposiciones')::int = v_n,
      format('debía llevar %s posposiciones, fue %s', v_n, v_res ->> 'posposiciones'));
  end loop;
  perform public._assert(
    (select count(*) from public.cocina_jornada_posposiciones where jornada_id = v_id) = 6,
    'deben quedar registradas 6 posposiciones');
  v_res := public.cocina_jornada_posponer();
  perform public._assert(not (v_res ->> 'ok')::boolean and v_res ->> 'error' = 'tope',
    format('la séptima posposición debía fallar por tope, fue %s', v_res));
  perform public._assert(
    public._cocina_jornada_limite_efectivo(v_id) = v_limite + interval '6 hours',
    'el límite efectivo debía alargarse seis horas');

  -- Tras el tope, si el límite ya pasó, el automático cierra.
  -- Con +6 horas desde un límite a 20 minutos, todavía no. No se fuerza.

  raise notice 'OK: todas las pruebas de jornada de cocina pasaron';
end;
$pruebas$;
