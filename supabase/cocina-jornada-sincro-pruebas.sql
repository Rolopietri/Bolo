-- Pruebas de supabase/cocina-jornada-sincro.sql
-- NO correr en producción. Las lanza scripts/probar-jornada-cierre.sh
-- después de las pruebas de cierre/horario.

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
  v_tz text := public._cocina_zona_horaria();
  v_ayer date;
  v_hoy_civil date;
  v_ts timestamptz;
  v_id uuid;
  v_nueva uuid;
  v_fecha date;
  v_tipo text;
  v_valor numeric;
  v_tfecha date;
  v_res jsonb;
begin
  v_hoy_civil := public._cocina_fecha_civil(now());
  v_ayer := v_hoy_civil - 1;

  -- Deja un horario que no dispare el automático a esta hora.
  update public.negocio_config
     set hora_apertura_habitual = time '18:00',
         hora_cierre_maxima = time '16:00',
         tasa_predeterminada = 'usd_bs'
   where id = 1;

  -- 13. Venta a la 1:00 de una jornada que empezó el día anterior:
  --     la fecha de negocio es la de esa jornada (el día anterior).
  v_id := (select id from public.cocina_jornadas where cerrado_at is null);
  perform public._assert(v_id is not null, 'debe haber una jornada abierta');
  v_ts := timezone(v_tz, (v_ayer::timestamp + time '18:00'));
  update public.cocina_jornadas
     set iniciado_at = v_ts,
         fecha = v_ayer
   where id = v_id;
  -- 01:00 del día civil siguiente.
  v_ts := timezone(v_tz, (v_hoy_civil::timestamp + time '01:00'));
  -- Las jornadas cerradas de pruebas anteriores no deben tapar esa hora.
  update public.cocina_jornadas
     set cerrado_at = v_ts
   where cerrado_at is not null
     and iniciado_at <= v_ts
     and cerrado_at > v_ts;
  v_fecha := public.jornada_fecha(v_ts);
  perform public._assert(v_fecha = v_ayer,
    format('jornada_fecha a la 1:00 debía ser %s (día de apertura), fue %s', v_ayer, v_fecha));
  perform public._assert(public._prod_hoy() = v_ayer,
    format('_prod_hoy debía ser la fecha de la jornada abierta (%s), fue %s', v_ayer, public._prod_hoy()));
  perform public._assert(public.negocio_hoy() = v_ayer,
    format('negocio_hoy debía ser %s, fue %s', v_ayer, public.negocio_hoy()));

  insert into public.ventas (id, receta_nombre, cantidad, total_usd)
  values ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'Prueba jornada', 1, 10);
  perform public._assert(
    (select fecha from public.ventas where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd') = v_ayer,
    'el default de ventas.fecha debía ser la fecha de la jornada abierta');

  -- 14. La tasa queda fija aunque llegue una nueva del BCV.
  insert into public.tasa_bcv (fecha, usd_bs, eur_bs, fuente)
  values (v_ayer, 36.0000, 39.0000, 'prueba')
  on conflict (fecha) do update set usd_bs = 36.0000, eur_bs = 39.0000;
  insert into public.tasa_bcv (fecha, usd_bs, eur_bs, fuente)
  values (v_hoy_civil, 40.0000, 43.0000, 'prueba')
  on conflict (fecha) do update set usd_bs = 40.0000, eur_bs = 43.0000;

  -- Limpia una tasa previa para forzar la toma oficial de la fecha de la jornada (ayer).
  update public.cocina_jornadas
     set tasa_tipo = null, tasa_valor = null, tasa_fecha = null
   where id = v_id;
  perform public._cocina_jornada_tomar_tasa(v_id);
  select tasa_tipo, tasa_valor, tasa_fecha into v_tipo, v_valor, v_tfecha
    from public.cocina_jornadas where id = v_id;
  perform public._assert(v_tipo = 'usd_bs' and v_valor = 36.0000 and v_tfecha = v_ayer,
    format('debía tomar el dólar BCV de la fecha de la jornada (36 el %s), fue %s %s %s',
           v_ayer, v_tipo, v_valor, v_tfecha));

  -- Llega una tasa nueva (ya insertada para hoy). Volver a "tomar" no debe cambiarla.
  perform public._cocina_jornada_tomar_tasa(v_id);
  perform public._assert(
    (select tasa_valor from public.cocina_jornadas where id = v_id) = 36.0000,
    'la tasa de la jornada no debe cambiar cuando entra una nueva del BCV');

  -- 16. Frescura: fecha civil, no la de la jornada, con una jornada del día anterior.
  perform public._assert(public._cocina_fecha_civil(now()) = v_hoy_civil,
    format('_cocina_fecha_civil debía ser el día civil (%s), fue %s',
           v_hoy_civil, public._cocina_fecha_civil(now())));
  perform public._assert(public._cocina_fecha_civil(now()) is distinct from public.jornada_fecha(),
    'la fecha civil no debe coincidir con jornada_fecha cuando la jornada es del día anterior');
  perform public._assert(public.jornada_fecha() = v_ayer,
    format('jornada_fecha sigue siendo la de la jornada abierta (%s), fue %s',
           v_ayer, public.jornada_fecha()));

  -- 15. Tasa propia: queda fija hasta el cierre; la siguiente jornada toma la oficial.
  v_res := public.cocina_jornada_fijar_tasa_propia(50);
  perform public._assert((v_res ->> 'ok')::boolean,
    format('fijar tasa propia debía ser ok: %s', v_res));
  perform public._assert(
    (select tasa_tipo from public.cocina_jornadas where id = v_id) = 'propia'
    and (select tasa_valor from public.cocina_jornadas where id = v_id) = 50,
    'la jornada abierta debía quedar con tasa propia 50');

  v_nueva := public._cocina_jornada_cerrar('cierre_caja', null, v_ayer);
  perform public._assert(v_nueva = v_id, 'el cierre debía cerrar la jornada de la tasa propia');
  select id into v_id from public.cocina_jornadas where cerrado_at is null;
  perform public._assert(v_id is not null and v_id <> v_nueva, 'debe abrirse una jornada nueva');
  select tasa_tipo, tasa_valor into v_tipo, v_valor
    from public.cocina_jornadas where id = v_id;
  perform public._assert(v_tipo = 'usd_bs' and v_valor = 40.0000,
    format('la nueva jornada debía tomar el dólar BCV vigente (40), fue %s %s', v_tipo, v_valor));
  perform public._assert(
    (select tasa_tipo from public.cocina_jornadas where id = v_nueva) = 'propia'
    and (select tasa_valor from public.cocina_jornadas where id = v_nueva) = 50,
    'la jornada cerrada debía conservar su tasa propia');

  raise notice 'OK: pruebas de fecha y tasa de jornada pasaron';
end;
$pruebas$;
