-- Cocina · Fecha y tasa de la jornada en toda la app
--
-- Pedido de Lucia (t46u, t49u). Este archivo es aditivo e idempotente sobre
-- cocina-jornada-cierre.sql y cocina-jornada-horario.sql. No aplicar en
-- producción sin su aprobación. No pisa el motor de stock ni las _prod_*
-- (salvo _prod_hoy, que pasa a delegar en jornada_fecha).
--
-- Decisiones:
-- 1) Una jornada que empieza después de medianoche toma la fecha del día nuevo
--    (ya definido en cocina-jornada-horario.sql).
-- 2) La tasa queda atada a la jornada: no cambia a mitad aunque el BCV publique
--    una nueva. La nueva se toma al abrir la siguiente.
-- 3) La factura de compra conserva la fecha impresa (fecha_documento). La fecha
--    de registro y la de pago siguen la jornada.
-- 4) La semana de administración es lunes a domingo, contada por jornadas
--    (eso vive en la app).
-- 5) El resumen de Telegram se manda al cerrar la jornada (caja o automático),
--    no a las 11:00 p. m.
--
-- En /negocio se elige la tasa predeterminada (usd_bs o eur_bs). Cada jornada
-- la toma al abrir y la guarda en tasa_tipo, tasa_valor, tasa_fecha. El usuario
-- puede fijar una tasa propia, que queda hasta el cierre.
--
-- Antes de reemplazar funciones se comparó con pg_get_functiondef en el
-- proyecto vivo abmpkbwhkghwtzosjpxt (27 nov 2026). _prod_salida y _prod_perdida
-- no se reescriben: ya llaman a _prod_hoy(). En _telegram_resumen_datos la
-- versión viva trae un acento roto en un comentario («d√≠a»); aquí el comentario
-- se escribe de nuevo, sin empeorar ese texto.

-- ─── Tasa predeterminada del negocio ───────────────────────────────
alter table public.negocio_config
  add column if not exists tasa_predeterminada text;

update public.negocio_config
   set tasa_predeterminada = 'usd_bs'
 where tasa_predeterminada is null;

alter table public.negocio_config
  alter column tasa_predeterminada set default 'usd_bs';

alter table public.negocio_config
  drop constraint if exists negocio_config_tasa_predeterminada_ok;
alter table public.negocio_config
  add constraint negocio_config_tasa_predeterminada_ok
  check (tasa_predeterminada in ('usd_bs', 'eur_bs'));

comment on column public.negocio_config.tasa_predeterminada is
  'Tasa BCV que toma sola cada jornada al abrir: usd_bs (dólar) o eur_bs (euro).';

-- ─── Tasa y resumen en la jornada ──────────────────────────────────
alter table public.cocina_jornadas
  add column if not exists tasa_tipo text,
  add column if not exists tasa_valor numeric(20, 4),
  add column if not exists tasa_fecha date,
  add column if not exists resumen_telegram_enviado_at timestamptz;

alter table public.cocina_jornadas
  drop constraint if exists cocina_jornadas_tasa_tipo_ok;
alter table public.cocina_jornadas
  add constraint cocina_jornadas_tasa_tipo_ok
  check (tasa_tipo is null or tasa_tipo in ('usd_bs', 'eur_bs', 'propia'));

comment on column public.cocina_jornadas.tasa_tipo is
  'Origen de la tasa de esta jornada: usd_bs, eur_bs o propia.';
comment on column public.cocina_jornadas.tasa_valor is
  'Valor en bolívares por unidad, fijo desde la apertura (o desde que se fijó una tasa propia) hasta el cierre.';
comment on column public.cocina_jornadas.tasa_fecha is
  'Fecha de publicación BCV de la tasa tomada, o la fecha de la jornada si es propia.';

-- Fecha impresa de la factura de compra (si la tabla ya existe).
do $col$
begin
  if exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'compras'
  ) then
    execute $sql$
      alter table public.compras
        add column if not exists fecha_documento date
    $sql$;
    execute $sql$
      comment on column public.compras.fecha_documento is
        'Fecha impresa en la factura. La columna fecha (registro) y fecha_pago siguen la jornada.'
    $sql$;
  end if;
end;
$col$;

-- ─── Defaults de fecha de negocio → jornada_fecha() ────────────────
do $def$
declare
  r record;
begin
  for r in
    select *
      from (values
        ('ventas', 'fecha'),
        ('compras', 'fecha'),
        ('procesamientos', 'fecha'),
        ('stock_movimientos', 'fecha'),
        ('menaje_movimientos', 'fecha'),
        ('admin_ingreso', 'fecha'),
        ('admin_egreso', 'fecha'),
        ('admin_propina', 'fecha'),
        ('admin_solicitud', 'fecha'),
        ('admin_cuenta_cobrar', 'fecha'),
        ('admin_cxc_pago', 'fecha')
      ) as t(tabla, columna)
  loop
    if exists (
      select 1 from information_schema.columns
       where table_schema = 'public'
         and table_name = r.tabla
         and column_name = r.columna
    ) then
      execute format(
        'alter table public.%I alter column %I set default public.jornada_fecha()',
        r.tabla, r.columna
      );
    end if;
  end loop;
end;
$def$;

-- ─── Tomar y consultar la tasa de la jornada ───────────────────────
create or replace function public._cocina_tasa_oficial(p_tipo text, p_al date)
returns table (valor numeric, fecha date)
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_tipo text := case when p_tipo = 'eur_bs' then 'eur_bs' else 'usd_bs' end;
  v_valor numeric;
  v_fecha date;
begin
  if to_regclass('public.tasa_bcv') is null then
    return;
  end if;
  if v_tipo = 'eur_bs' then
    select t.eur_bs, t.fecha into v_valor, v_fecha
      from public.tasa_bcv t
     where t.fecha <= p_al and t.eur_bs is not null and t.eur_bs > 0
     order by t.fecha desc
     limit 1;
    if v_valor is null then
      select t.eur_bs, t.fecha into v_valor, v_fecha
        from public.tasa_bcv t
       where t.eur_bs is not null and t.eur_bs > 0
       order by t.fecha desc
       limit 1;
    end if;
  else
    select t.usd_bs, t.fecha into v_valor, v_fecha
      from public.tasa_bcv t
     where t.fecha <= p_al and t.usd_bs is not null and t.usd_bs > 0
     order by t.fecha desc
     limit 1;
    if v_valor is null then
      select t.usd_bs, t.fecha into v_valor, v_fecha
        from public.tasa_bcv t
       where t.usd_bs is not null and t.usd_bs > 0
       order by t.fecha desc
       limit 1;
    end if;
  end if;
  if v_valor is null then
    return;
  end if;
  valor := v_valor;
  fecha := v_fecha;
  return next;
end;
$function$;

-- Solo rellena si todavía no hay tasa (no pisa una propia ni la ya tomada).
create or replace function public._cocina_jornada_tomar_tasa(p_jornada uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_tipo text;
  v_fecha date;
  v_valor numeric;
  v_tasa_fecha date;
  v_ya numeric;
  v_ya_tipo text;
begin
  select tasa_tipo, tasa_valor, fecha
    into v_ya_tipo, v_ya, v_fecha
    from public.cocina_jornadas
   where id = p_jornada
     for update;
  if not found then
    return;
  end if;
  if v_ya is not null or v_ya_tipo = 'propia' then
    return;
  end if;

  v_tipo := coalesce(
    (select tasa_predeterminada from public.negocio_config order by id limit 1),
    'usd_bs'
  );
  if v_tipo not in ('usd_bs', 'eur_bs') then
    v_tipo := 'usd_bs';
  end if;

  select o.valor, o.fecha into v_valor, v_tasa_fecha
    from public._cocina_tasa_oficial(v_tipo, v_fecha) o;

  update public.cocina_jornadas
     set tasa_tipo = v_tipo,
         tasa_valor = v_valor,
         tasa_fecha = v_tasa_fecha
   where id = p_jornada
     and tasa_valor is null
     and (tasa_tipo is distinct from 'propia');
end;
$function$;

create or replace function public.cocina_jornada_fijar_tasa_propia(p_valor numeric)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id uuid;
begin
  if p_valor is null or p_valor <= 0 then
    return jsonb_build_object('ok', false, 'error', 'valor');
  end if;
  v_id := public._cocina_jornada_abierta();
  update public.cocina_jornadas
     set tasa_tipo = 'propia',
         tasa_valor = p_valor,
         tasa_fecha = fecha
   where id = v_id
     and cerrado_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'cerrada');
  end if;
  return jsonb_build_object(
    'ok', true,
    'jornada_id', v_id,
    'tasa_tipo', 'propia',
    'tasa_valor', p_valor
  );
end;
$function$;

-- Tasa de la jornada que cubre ese instante (no crea jornada).
create or replace function public.tasa_jornada(p_ts timestamptz default now())
returns table (
  jornada_id uuid,
  fecha date,
  tasa_tipo text,
  tasa_valor numeric,
  tasa_fecha date
)
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  select j.id, j.fecha, j.tasa_tipo, j.tasa_valor, j.tasa_fecha
    from public.jornada_de(p_ts) d
    join public.cocina_jornadas j on j.id = d.id;
$function$;

-- Tasa guardada de la jornada de esa fecha de negocio (si hay varias, la última).
-- Si no hay jornada, cae a la tasa BCV oficial del tipo predeterminado.
create or replace function public.tasa_jornada_de_fecha(p_fecha date)
returns table (
  jornada_id uuid,
  fecha date,
  tasa_tipo text,
  tasa_valor numeric,
  tasa_fecha date
)
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_tipo text;
begin
  return query
    select j.id, j.fecha, j.tasa_tipo, j.tasa_valor, j.tasa_fecha
      from public.cocina_jornadas j
     where j.fecha = p_fecha
       and j.tasa_valor is not null
     order by j.iniciado_at desc
     limit 1;
  if found then
    return;
  end if;
  v_tipo := coalesce(
    (select tasa_predeterminada from public.negocio_config order by id limit 1),
    'usd_bs'
  );
  jornada_id := null;
  fecha := p_fecha;
  tasa_tipo := v_tipo;
  select o.valor, o.fecha into tasa_valor, tasa_fecha
    from public._cocina_tasa_oficial(v_tipo, p_fecha) o;
  return next;
end;
$function$;

-- ─── Apertura y cierre: sellan la tasa ─────────────────────────────
create or replace function public._cocina_jornada_abierta()
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id uuid;
  v_ts timestamptz := now();
begin
  select id into v_id
    from public.cocina_jornadas
   where cerrado_at is null
   order by iniciado_at desc
   limit 1
   for update;
  if v_id is not null then
    perform public._cocina_jornada_tomar_tasa(v_id);
    return v_id;
  end if;

  insert into public.cocina_jornadas (iniciado_at, fecha)
  values (v_ts, public._cocina_fecha_civil(v_ts))
  returning id into v_id;

  perform public._cocina_jornada_foto(v_id, 'apertura');
  perform public._cocina_jornada_tomar_tasa(v_id);
  return v_id;
end;
$function$;

create or replace function public._cocina_jornada_cerrar(
  p_origen text,
  p_cierre_caja_id uuid default null,
  p_cierre_caja_fecha date default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_abierta uuid;
  v_nueva uuid;
  v_fecha date;
  v_ts timestamptz := now();
begin
  if p_origen not in ('cierre_caja', 'respaldo', 'automatico') then
    raise exception 'origen de cierre inválido: %', p_origen;
  end if;

  if p_cierre_caja_id is not null
     and exists (
       select 1 from public.cocina_jornadas
        where cierre_caja_id = p_cierre_caja_id
     ) then
    return null;
  end if;

  v_fecha := p_cierre_caja_fecha;
  if v_fecha is null and p_cierre_caja_id is not null then
    select fecha into v_fecha from public.cierre_caja where id = p_cierre_caja_id;
  end if;

  v_abierta := public._cocina_jornada_abierta();

  update public.cocina_jornadas
     set cerrado_at = v_ts,
         origen = p_origen,
         cierre_caja_id = p_cierre_caja_id,
         cierre_caja_fecha = case when p_origen = 'cierre_caja' then v_fecha else cierre_caja_fecha end
   where id = v_abierta
     and cerrado_at is null;

  if not found then
    return null;
  end if;

  perform public._cocina_jornada_foto(v_abierta, 'cierre');

  insert into public.cocina_jornadas (iniciado_at, fecha)
  values (v_ts, public._cocina_fecha_civil(v_ts))
  returning id into v_nueva;

  insert into public.cocina_jornada_saldos (
    jornada_id, insumo_id, momento, stock_actual, stock_procesado, procesado_habilitado
  )
  select v_nueva, insumo_id, 'apertura', stock_actual, stock_procesado, 0
    from public.cocina_jornada_saldos
   where jornada_id = v_abierta
     and momento = 'cierre'
  on conflict (jornada_id, insumo_id, momento) do nothing;

  perform public._cocina_jornada_tomar_tasa(v_nueva);
  return v_abierta;
end;
$function$;

-- ─── Estado / revisar incluyen la tasa ─────────────────────────────
drop function if exists public.cocina_jornada_estado();

create function public.cocina_jornada_estado()
returns table (
  jornada_id uuid,
  fecha date,
  iniciado_at timestamptz,
  hora_apertura_habitual time,
  hora_cierre_maxima time,
  nota text,
  limite_efectivo timestamptz,
  alerta_desde timestamptz,
  posposiciones integer,
  puede_posponer boolean,
  mostrar_alerta boolean,
  debe_cerrar boolean,
  tasa_tipo text,
  tasa_valor numeric,
  tasa_fecha date,
  tasa_predeterminada text
)
language plpgsql
stable
security invoker
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id uuid;
  v_fecha date;
  v_ini timestamptz;
  v_limite timestamptz;
  v_n int;
  v_ap time;
  v_ci time;
  v_nota text;
  v_tipo text;
  v_valor numeric;
  v_tfecha date;
  v_pred text;
begin
  select j.id, j.fecha, j.iniciado_at, j.tasa_tipo, j.tasa_valor, j.tasa_fecha
    into v_id, v_fecha, v_ini, v_tipo, v_valor, v_tfecha
    from public.cocina_jornadas j
   where j.cerrado_at is null
   order by j.iniciado_at desc
   limit 1;
  select h.hora_apertura, h.hora_cierre, h.nota into v_ap, v_ci, v_nota
    from public._cocina_horario_negocio() h;
  v_pred := coalesce(
    (select nc.tasa_predeterminada from public.negocio_config nc order by id limit 1),
    'usd_bs'
  );
  if v_id is not null then
    v_limite := public._cocina_jornada_limite_efectivo(v_id);
    v_n := public._cocina_jornada_posposiciones_n(v_id);
  else
    v_n := 0;
  end if;
  jornada_id := v_id;
  fecha := v_fecha;
  iniciado_at := v_ini;
  hora_apertura_habitual := v_ap;
  hora_cierre_maxima := v_ci;
  nota := v_nota;
  limite_efectivo := v_limite;
  alerta_desde := case when v_limite is not null then v_limite - interval '30 minutes' end;
  posposiciones := v_n;
  puede_posponer := v_id is not null and v_limite is not null and v_n < 6;
  debe_cerrar := v_limite is not null and now() >= v_limite;
  mostrar_alerta := v_limite is not null and now() >= (v_limite - interval '30 minutes');
  tasa_tipo := v_tipo;
  tasa_valor := v_valor;
  tasa_fecha := v_tfecha;
  tasa_predeterminada := v_pred;
  return next;
end;
$function$;

create or replace function public.cocina_jornada_revisar()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_cerro uuid;
  v_est record;
begin
  v_cerro := public._cocina_jornada_automatico();
  if v_cerro is not null then
    -- Asegura tasa en la jornada nueva que dejó el automático.
    perform public._cocina_jornada_tomar_tasa(
      (select id from public.cocina_jornadas where cerrado_at is null order by iniciado_at desc limit 1)
    );
  end if;
  select * into v_est from public.cocina_jornada_estado();
  return jsonb_build_object(
    'cerro_jornada_id', v_cerro,
    'jornada_id', v_est.jornada_id,
    'fecha', v_est.fecha,
    'iniciado_at', v_est.iniciado_at,
    'hora_apertura_habitual', v_est.hora_apertura_habitual,
    'hora_cierre_maxima', v_est.hora_cierre_maxima,
    'nota', v_est.nota,
    'limite_efectivo', v_est.limite_efectivo,
    'alerta_desde', v_est.alerta_desde,
    'posposiciones', v_est.posposiciones,
    'puede_posponer', v_est.puede_posponer,
    'mostrar_alerta', v_est.mostrar_alerta,
    'debe_cerrar', v_est.debe_cerrar,
    'tasa_tipo', v_est.tasa_tipo,
    'tasa_valor', v_est.tasa_valor,
    'tasa_fecha', v_est.tasa_fecha,
    'tasa_predeterminada', v_est.tasa_predeterminada
  );
end;
$function$;

drop function if exists public.jornada_actual();
create function public.jornada_actual()
returns table (
  id uuid,
  fecha date,
  iniciado_at timestamptz,
  cerrado_at timestamptz,
  origen text,
  tasa_tipo text,
  tasa_valor numeric,
  tasa_fecha date
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id uuid;
begin
  v_id := public._cocina_jornada_abierta();
  return query
    select j.id, j.fecha, j.iniciado_at, j.cerrado_at, j.origen,
           j.tasa_tipo, j.tasa_valor, j.tasa_fecha
      from public.cocina_jornadas j
     where j.id = v_id;
end;
$function$;

-- ─── _prod_hoy / negocio_hoy delegan ───────────────────────────────
create or replace function public._prod_hoy()
returns date
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  select public.jornada_fecha();
$function$;

create or replace function public.negocio_hoy()
returns date
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  select public.jornada_fecha();
$function$;

-- ─── Funciones vivas: current_date → jornada_fecha() ───────────────
-- Cuerpos tomados de pg_get_functiondef el 27 nov 2026. Solo cambia la fecha.

create or replace function public.ajustar_stock_conteo(p_insumo_id uuid, p_nuevo numeric, p_nota text default null)
returns numeric
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_viejo numeric;
  v_delta numeric;
begin
  perform set_config('bolo.motivo', 'conteo', true);
  if p_nuevo is null or p_nuevo < 0 then
    raise exception 'El conteo debe ser un número mayor o igual a 0';
  end if;

  select stock_actual into v_viejo
    from public.insumos where id = p_insumo_id
    for update;
  if not found then
    raise exception 'Insumo no encontrado';
  end if;

  v_delta := p_nuevo - coalesce(v_viejo, 0);
  if v_delta = 0 then
    return p_nuevo;
  end if;

  update public.insumos set stock_actual = p_nuevo where id = p_insumo_id;

  insert into public.stock_movimientos
    (insumo_id, tipo, capa, cantidad, motivo, fecha, nota)
  values
    (p_insumo_id, 'ajuste', 'total', v_delta, 'Conteo físico', public.jornada_fecha(),
     nullif(btrim(coalesce(p_nota, '')), ''));

  return p_nuevo;
end;
$function$;

create or replace function public.registrar_perdida_stock(p_insumo_id uuid, p_tipo text, p_cantidad numeric, p_motivo text default null, p_fecha date default null, p_nota text default null)
returns table(id uuid, insumo_id uuid, tipo text, capa text, cantidad numeric, motivo text, fecha date, nota text, created_at timestamp with time zone, stock_nuevo numeric)
language plpgsql
set search_path to 'public'
as $function$
declare
  v_nuevo numeric;
  v_mov public.stock_movimientos%rowtype;
begin
  perform set_config('bolo.motivo', 'perdida:' || coalesce(p_tipo, 'otro'), true);
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad debe ser mayor a 0.';
  end if;

  update public.insumos
     set stock_actual = greatest(0, coalesce(stock_actual, 0) - p_cantidad)
   where insumos.id = p_insumo_id
   returning stock_actual into v_nuevo;
  if not found then
    raise exception 'Insumo no encontrado';
  end if;

  insert into public.stock_movimientos
    (insumo_id, tipo, capa, cantidad, motivo, fecha, nota)
  values
    (p_insumo_id, p_tipo, 'total', -abs(p_cantidad), p_motivo,
     coalesce(p_fecha, public.jornada_fecha()), p_nota)
  returning * into v_mov;

  return query
    select v_mov.id, v_mov.insumo_id, v_mov.tipo, v_mov.capa, v_mov.cantidad,
           v_mov.motivo, v_mov.fecha, v_mov.nota, v_mov.created_at, v_nuevo;
end;
$function$;

create or replace function public.registrar_procesamiento(p_insumo_id uuid, p_crudo numeric, p_procesado numeric, p_fecha date default null, p_nota text default null, p_responsable text default null, p_origen text default 'manual')
returns table(insumo_id uuid, stock_crudo numeric, stock_procesado numeric, merma numeric, movimiento_id uuid)
language plpgsql
set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_crudo_nuevo numeric;
  v_proc_nuevo  numeric;
  v_merma       numeric;
  v_mov_id      uuid;
  v_crudo_actual numeric;
  v_origen      text;
begin
  if p_crudo is null or p_crudo <= 0 then
    raise exception 'El crudo procesado debe ser mayor a 0.';
  end if;
  if p_procesado is null or p_procesado < 0 then
    raise exception 'El procesado obtenido no puede ser negativo.';
  end if;

  v_origen := coalesce(p_origen, 'manual');
  if v_origen not in ('manual', 'escaneo', 'telegram') then
    v_origen := 'manual';
  end if;

  select coalesce(stock_actual, 0) into v_crudo_actual
    from public.insumos where id = p_insumo_id for update;
  if not found then
    raise exception 'Insumo no encontrado';
  end if;
  if p_crudo > v_crudo_actual + 0.00005 then
    raise exception 'No hay suficiente crudo: tienes % y quieres procesar %.',
      v_crudo_actual, p_crudo;
  end if;

  v_merma := p_crudo - p_procesado;

  update public.insumos
     set stock_actual     = greatest(0, coalesce(stock_actual, 0) - p_crudo),
         stock_procesado  = coalesce(stock_procesado, 0) + p_procesado
   where id = p_insumo_id
   returning stock_actual, stock_procesado into v_crudo_nuevo, v_proc_nuevo;

  if v_merma <> 0 then
    insert into public.stock_movimientos
      (insumo_id, tipo, capa, cantidad, motivo, fecha, nota)
    values
      (p_insumo_id, 'merma', 'total', -v_merma, 'Procesamiento',
       coalesce(p_fecha, public.jornada_fecha()), p_nota)
    returning id into v_mov_id;
  end if;

  insert into public.procesamientos
    (insumo_id, fecha, crudo, procesado, merma_porc, nota, responsable, origen, created_by)
  values (
    p_insumo_id, coalesce(p_fecha, public.jornada_fecha()), p_crudo, p_procesado,
    case when p_crudo > 0 then (p_crudo - p_procesado) / p_crudo * 100 else 0 end,
    p_nota, nullif(btrim(coalesce(p_responsable, '')), ''), v_origen, auth.uid()
  );

  return query select p_insumo_id, v_crudo_nuevo, v_proc_nuevo, v_merma, v_mov_id;
end;
$function$;

create or replace function public.create_plan_produccion(p_receta_id uuid, p_receta_nombre text, p_raciones numeric, p_fecha_objetivo date, p_nota text, p_compromisos jsonb)
returns uuid
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_plan_id uuid;
  v_item jsonb;
  v_insumo_id uuid;
  v_cant numeric;
  v_unidad text;
begin
  insert into public.cocina_planes_produccion
    (receta_id, receta_nombre, raciones, fecha_objetivo, nota)
  values
    (p_receta_id, p_receta_nombre, p_raciones, p_fecha_objetivo,
     nullif(trim(coalesce(p_nota, '')), ''))
  returning id into v_plan_id;

  for v_item in select * from jsonb_array_elements(p_compromisos)
  loop
    v_insumo_id := (v_item->>'insumo_id')::uuid;
    v_cant := (v_item->>'cantidad')::numeric;
    v_unidad := v_item->>'unidad_base';

    if v_cant <= 0 then continue; end if;

    insert into public.cocina_plan_compromisos
      (plan_id, insumo_id, cantidad, unidad_base)
    values (v_plan_id, v_insumo_id, v_cant, v_unidad);

    update public.insumos
       set stock_comprometido = coalesce(stock_comprometido, 0) + v_cant
     where id = v_insumo_id;

    insert into public.stock_movimientos
      (insumo_id, tipo, capa, cantidad, motivo, fecha, nota)
    values
      (v_insumo_id, 'comprometido_in', 'comprometido', v_cant,
       'Plan: ' || p_receta_nombre, public.jornada_fecha(),
       'Plan ' || v_plan_id::text);
  end loop;

  return v_plan_id;
end;
$function$;

create or replace function public.cancelar_plan_produccion(p_plan_id uuid)
returns void
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_estado text;
  v_nombre text;
  v_raciones numeric;
  v_consumidas numeric;
  v_frac numeric;
  v_comp record;
begin
  select estado, receta_nombre, raciones, coalesce(raciones_consumidas, 0)
    into v_estado, v_nombre, v_raciones, v_consumidas
    from public.cocina_planes_produccion where id = p_plan_id;
  if v_estado is null then
    raise exception 'Plan no encontrado';
  end if;
  if v_estado <> 'pendiente' then
    raise exception 'Solo se pueden cancelar planes pendientes (actual: %)', v_estado;
  end if;

  v_frac := case when v_raciones > 0
                 then (v_raciones - v_consumidas) / v_raciones
                 else 0 end;

  for v_comp in
    select insumo_id, cantidad from public.cocina_plan_compromisos where plan_id = p_plan_id
  loop
    update public.insumos
       set stock_comprometido =
             greatest(0, coalesce(stock_comprometido, 0) - v_comp.cantidad * v_frac)
     where id = v_comp.insumo_id;

    insert into public.stock_movimientos
      (insumo_id, tipo, capa, cantidad, motivo, fecha, nota)
    values
      (v_comp.insumo_id, 'comprometido_out', 'comprometido', -(v_comp.cantidad * v_frac),
       'Plan cancelado: ' || v_nombre, public.jornada_fecha(),
       'Plan ' || p_plan_id::text);
  end loop;

  update public.cocina_planes_produccion
     set estado = 'cancelado', cancelado_at = now()
   where id = p_plan_id;
end;
$function$;

create or replace function public.delete_plan_produccion(p_plan_id uuid)
returns void
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_estado text;
  v_nombre text;
  v_raciones numeric;
  v_consumidas numeric;
  v_frac numeric;
  v_comp record;
begin
  select estado, receta_nombre, raciones, coalesce(raciones_consumidas, 0)
    into v_estado, v_nombre, v_raciones, v_consumidas
    from public.cocina_planes_produccion where id = p_plan_id;
  if v_estado is null then return; end if;

  if v_estado = 'completado' then
    raise exception 'No se puede borrar un plan completado: solo se vende o se registra como pérdida.';
  end if;

  if v_estado = 'pendiente' then
    v_frac := case when v_raciones > 0
                   then (v_raciones - v_consumidas) / v_raciones
                   else 0 end;
    if v_frac > 0 then
      for v_comp in
        select insumo_id, cantidad
          from public.cocina_plan_compromisos where plan_id = p_plan_id
      loop
        update public.insumos
           set stock_comprometido =
                 greatest(0, coalesce(stock_comprometido, 0) - v_comp.cantidad * v_frac)
         where id = v_comp.insumo_id;

        insert into public.stock_movimientos
          (insumo_id, tipo, capa, cantidad, motivo, fecha, nota)
        values
          (v_comp.insumo_id, 'comprometido_out', 'comprometido', -(v_comp.cantidad * v_frac),
           'Plan borrado: ' || v_nombre, public.jornada_fecha(),
           'Plan ' || p_plan_id::text);
      end loop;
    end if;
  end if;

  delete from public.cocina_planes_produccion where id = p_plan_id;
end;
$function$;

-- ─── Resumen de Telegram por jornada ───────────────────────────────
create or replace function public._telegram_resumen_datos(p_fecha date)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  with jornada as (
    select j.iniciado_at as desde,
           coalesce(j.cerrado_at, now()) as hasta
      from public.cocina_jornadas j
     where j.fecha = p_fecha
     order by j.iniciado_at desc
     limit 1
  ),
  dia as (
    select
      coalesce((select desde from jornada), (p_fecha::timestamp at time zone 'America/Caracas')) as desde,
      coalesce((select hasta from jornada), ((p_fecha + 1)::timestamp at time zone 'America/Caracas')) as hasta
  )
  select jsonb_build_object(
    'fecha', p_fecha,
    'mensajes', coalesce((
      select jsonb_agg(jsonb_build_object('remitente', p.remitente, 'resultado', p.resultado, 'enviado_at', p.enviado_at)
                       order by p.enviado_at)
        from produccion_pendientes p, dia
       where p.estado = 'aplicado' and p.enviado_at >= dia.desde and p.enviado_at < dia.hasta), '[]'::jsonb),
    -- Procesamientos cerrados en la ventana de la jornada (o del día civil si aún no hay jornada).
    'procesados', coalesce((
      select jsonb_agg(jsonb_build_object('nombre', i.nombre, 'unidad_base', i.unidad_base, 'crudo', pr.crudo,
                                          'procesado', pr.procesado, 'merma_porc', pr.merma_porc,
                                          'estandar', i.merma_coccion_porc, 'responsable', pr.responsable,
                                          'nota', pr.nota)
                       order by pr.created_at)
        from procesamientos pr join insumos i on i.id = pr.insumo_id, dia
       where (pr.created_at >= dia.desde and pr.created_at < dia.hasta)
          or (pr.created_at is null and pr.fecha = p_fecha)), '[]'::jsonb),
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
$function$;

create or replace function public._telegram_resumen_datos_jornada(p_jornada uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_fecha date;
begin
  select fecha into v_fecha from public.cocina_jornadas where id = p_jornada;
  if v_fecha is null then
    return jsonb_build_object('fecha', null);
  end if;
  return public._telegram_resumen_datos(v_fecha);
end;
$function$;

create or replace function public.telegram_resumen_servicio_jornada(p_jornada uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  c produccion_telegram;
  v_fecha date;
begin
  select fecha into v_fecha from public.cocina_jornadas where id = p_jornada;
  if v_fecha is null then
    return jsonb_build_object('chat_id', null);
  end if;
  if to_regclass('public.produccion_telegram') is null then
    return jsonb_build_object('chat_id', null, 'datos', public._telegram_resumen_datos(v_fecha), 'jornada_id', p_jornada, 'fecha', v_fecha);
  end if;
  select * into c from produccion_telegram where id = 1;
  if c.id is null or c.bot_token is null or c.resumen_chat_id is null then
    return jsonb_build_object('chat_id', null, 'datos', public._telegram_resumen_datos(v_fecha), 'jornada_id', p_jornada, 'fecha', v_fecha);
  end if;
  return jsonb_build_object(
    'token', c.bot_token,
    'chat_id', c.resumen_chat_id,
    'datos', public._telegram_resumen_datos(v_fecha),
    'jornada_id', p_jornada,
    'fecha', v_fecha
  );
end;
$function$;

-- telegram_resumen_servicio(p_fecha) se deja: ahora _telegram_resumen_datos
-- usa la ventana de la jornada de esa fecha. El cron de las 11:00 p. m. pasa
-- a ser un repesca de jornadas cerradas sin resumen enviado (en la app).

create or replace function public.cocina_jornadas_resumen_pendiente()
returns table (jornada_id uuid, fecha date, cerrado_at timestamptz, origen text)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select j.id, j.fecha, j.cerrado_at, j.origen
    from public.cocina_jornadas j
   where j.cerrado_at is not null
     and j.resumen_telegram_enviado_at is null
     and j.origen in ('cierre_caja', 'automatico', 'respaldo')
   order by j.cerrado_at;
$function$;

create or replace function public.cocina_jornada_marcar_resumen(p_jornada uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  update public.cocina_jornadas
     set resumen_telegram_enviado_at = now()
   where id = p_jornada
     and resumen_telegram_enviado_at is null;
end;
$function$;

-- Sellar la tasa de las jornadas abiertas que aún no la tienen.
do $back$
declare
  r record;
begin
  for r in select id from public.cocina_jornadas where cerrado_at is null loop
    perform public._cocina_jornada_tomar_tasa(r.id);
  end loop;
end;
$back$;

-- ─── Permisos ──────────────────────────────────────────────────────
revoke all on function public._cocina_tasa_oficial(text, date) from public, anon;
revoke all on function public._cocina_jornada_tomar_tasa(uuid) from public, anon, authenticated;
revoke all on function public._telegram_resumen_datos_jornada(uuid) from public, anon, authenticated;
revoke all on function public.telegram_resumen_servicio_jornada(uuid) from public, anon, authenticated;
revoke all on function public.cocina_jornada_marcar_resumen(uuid) from public, anon;
revoke all on function public.cocina_jornadas_resumen_pendiente() from public, anon;

grant execute on function public._cocina_tasa_oficial(text, date) to authenticated;
grant execute on function public.cocina_jornada_fijar_tasa_propia(numeric) to authenticated;
grant execute on function public.tasa_jornada(timestamptz) to authenticated;
grant execute on function public.tasa_jornada_de_fecha(date) to authenticated;
grant execute on function public.cocina_jornada_estado() to authenticated;
grant execute on function public.cocina_jornada_revisar() to authenticated;
grant execute on function public.jornada_actual() to authenticated;
grant execute on function public._prod_hoy() to authenticated;
grant execute on function public.negocio_hoy() to authenticated;
grant execute on function public.cocina_jornadas_resumen_pendiente() to authenticated;
grant execute on function public.cocina_jornada_marcar_resumen(uuid) to authenticated;
grant execute on function public.telegram_resumen_servicio_jornada(uuid) to service_role;
grant execute on function public.cocina_jornadas_resumen_pendiente() to service_role;
grant execute on function public.cocina_jornada_marcar_resumen(uuid) to service_role;


-- ─── Frescura de precios: días de calendario, no de jornada ──────
-- Lucia (t52u): precio_actualizado y el cálculo de antigüedad usan la
-- fecha civil en la zona del negocio (`_cocina_fecha_civil`, ya definida
-- en el SQL de horario), no jornada_fecha() ni compras.fecha (esta última
-- es fecha de negocio). Se reescriben las tres funciones vivas que
-- estampan la columna, a partir de pg_get_functiondef del 27 nov 2026;
-- el único cambio es esa asignación.

create or replace function public.apply_compra_to_insumo()
returns trigger
language plpgsql
as $function$
declare
  v_unidad_base text;
  v_cantidad_por_compra numeric;
  v_stock_add numeric;
  v_precio_compra_unit numeric;
  v_monto numeric;
begin
  perform set_config('bolo.motivo', 'compra', true);

  select unidad_base, cantidad_por_compra into v_unidad_base, v_cantidad_por_compra
  from public.insumos where id = new.insumo_id;

  v_stock_add := new.cantidad * coalesce(v_cantidad_por_compra, 1);

  v_monto := coalesce(new.costo_usd, new.precio_total_usd);
  if new.cantidad > 0 then
    v_precio_compra_unit := v_monto / new.cantidad;
  else
    v_precio_compra_unit := v_monto;
  end if;

  update public.insumos set
    stock_actual = coalesce(stock_actual, 0) + v_stock_add,

    penultima_fecha = ultima_fecha,
    penultima_cantidad = ultima_cantidad,
    penultima_precio_usd = ultima_precio_usd,
    penultima_precio_bs = ultima_precio_bs,

    ultima_fecha = new.fecha,
    ultima_cantidad = new.cantidad,
    ultima_precio_usd = v_precio_compra_unit,
    ultima_precio_bs = case
      when new.cantidad > 0 and new.precio_total_bs is not null
        then new.precio_total_bs / new.cantidad
      else null
    end,

    precio_compra_usd = v_precio_compra_unit,
    precio_base_usd = case
      when v_cantidad_por_compra > 0 then v_precio_compra_unit / v_cantidad_por_compra
      else v_precio_compra_unit
    end,
    -- Frescura: día civil de la confirmación, no la fecha de jornada de la compra.
    precio_actualizado = public._cocina_fecha_civil(now()),

    proveedor_id = coalesce(new.proveedor_id, proveedor_id)
  where id = new.insumo_id;

  return new;
end;
$function$;

create or replace function public.revertir_compra_de_insumo()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_factor_vivo numeric;
  v_stock_sub numeric;
  v_ult public.compras%rowtype;
  v_pen public.compras%rowtype;
  v_hay_ult boolean := false;
  v_hay_pen boolean := false;
  v_factor numeric;
  v_ult_unit numeric;
  v_pen_unit numeric;
  v_ult_monto numeric;
  v_pen_monto numeric;
begin
  perform set_config('bolo.motivo', 'compra_revertida', true);

  select cantidad_por_compra into v_factor_vivo
    from public.insumos where id = old.insumo_id
    for update;

  v_stock_sub := old.cantidad
    * coalesce(old.cantidad_por_compra_snap, v_factor_vivo, 1);

  perform public.bolo_rechazar_stock_negativo(old.insumo_id, -v_stock_sub);

  select * into v_ult
    from public.compras c
   where c.insumo_id = old.insumo_id
   order by c.fecha desc, c.created_at desc, c.id desc
   limit 1;
  v_hay_ult := found;

  if v_hay_ult then
    select * into v_pen
      from public.compras c
     where c.insumo_id = old.insumo_id
       and c.id <> v_ult.id
     order by c.fecha desc, c.created_at desc, c.id desc
     limit 1;
    v_hay_pen := found;
  end if;

  if not v_hay_ult then
    update public.insumos set
      stock_actual = coalesce(stock_actual, 0) - v_stock_sub,
      ultima_fecha = null,
      ultima_cantidad = null,
      ultima_precio_usd = null,
      ultima_precio_bs = null,
      precio_compra_usd = null,
      precio_base_usd = null,
      precio_actualizado = null,
      penultima_fecha = null,
      penultima_cantidad = null,
      penultima_precio_usd = null,
      penultima_precio_bs = null
    where id = old.insumo_id;
  else
    v_factor := coalesce(v_ult.cantidad_por_compra_snap, v_factor_vivo, 1);
    v_ult_monto := coalesce(v_ult.costo_usd, v_ult.precio_total_usd);
    v_ult_unit := case
      when v_ult.cantidad > 0 then v_ult_monto / v_ult.cantidad
      else v_ult_monto
    end;
    if v_hay_pen then
      v_pen_monto := coalesce(v_pen.costo_usd, v_pen.precio_total_usd);
      v_pen_unit := case
        when v_pen.cantidad > 0 then v_pen_monto / v_pen.cantidad
        else v_pen_monto
      end;
    end if;

    update public.insumos set
      stock_actual = coalesce(stock_actual, 0) - v_stock_sub,
      ultima_fecha = v_ult.fecha,
      ultima_cantidad = v_ult.cantidad,
      ultima_precio_usd = v_ult_unit,
      ultima_precio_bs = case
        when v_ult.cantidad > 0 and v_ult.precio_total_bs is not null
          then v_ult.precio_total_bs / v_ult.cantidad
        else null
      end,
      precio_compra_usd = v_ult_unit,
      precio_base_usd = case
        when v_factor > 0 then v_ult_unit / v_factor
        else v_ult_unit
      end,
      -- Frescura: día civil en que se registró esa compra que queda, no su fecha de jornada.
      precio_actualizado = public._cocina_fecha_civil(v_ult.created_at),
      penultima_fecha = case when v_hay_pen then v_pen.fecha else null end,
      penultima_cantidad = case when v_hay_pen then v_pen.cantidad else null end,
      penultima_precio_usd = case when v_hay_pen then v_pen_unit else null end,
      penultima_precio_bs = case
        when not v_hay_pen then null
        when v_pen.cantidad > 0 and v_pen.precio_total_bs is not null
          then v_pen.precio_total_bs / v_pen.cantidad
        else null
      end
    where id = old.insumo_id;
  end if;

  return old;
end;
$function$;

create or replace function public.reemplazar_compra(p_id uuid, p_insumo_id uuid, p_proveedor_id uuid, p_fecha date, p_cantidad numeric, p_precio_total_usd numeric, p_precio_total_bs numeric, p_tasa_bcv_usada numeric, p_modalidad_pago text, p_notas text, p_numero_factura text, p_flete_usd numeric, p_pagada boolean, p_fecha_pago date, p_base_usd numeric, p_iva_usd numeric, p_exento_usd numeric, p_costo_usd numeric)
returns compras
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_old public.compras;
  v_nueva public.compras;
  v_factor_viejo numeric;
  v_factor_nuevo numeric;
  v_stock_viejo numeric;
  v_stock_nuevo numeric;
  v_recupera boolean;
  v_costo numeric;
  v_ids uuid[];
  v_id uuid;
  v_ult public.compras;
  v_monto numeric;
  v_unit numeric;
  v_factor numeric;
begin
  select * into v_old from public.compras where id = p_id for update;
  if not found then
    raise exception 'No está la compra a editar';
  end if;

  if v_old.insumo_id is distinct from p_insumo_id
     and v_old.insumo_id < p_insumo_id then
    perform 1 from public.insumos where id = v_old.insumo_id for update;
  end if;

  select coalesce(cantidad_por_compra, 1) into v_factor_nuevo
    from public.insumos where id = p_insumo_id for update;
  if v_factor_nuevo is null then
    v_factor_nuevo := 1;
  end if;

  if v_old.insumo_id is distinct from p_insumo_id
     and v_old.insumo_id > p_insumo_id then
    perform 1 from public.insumos where id = v_old.insumo_id for update;
  end if;

  v_factor_viejo := coalesce(v_old.cantidad_por_compra_snap, 1);
  v_stock_viejo := v_old.cantidad * v_factor_viejo;
  if v_old.insumo_id = p_insumo_id then
    v_stock_nuevo := p_cantidad * v_factor_viejo;
    v_factor_nuevo := v_factor_viejo;
    perform public.bolo_rechazar_stock_negativo(
      p_insumo_id, v_stock_nuevo - v_stock_viejo
    );
  else
    v_stock_nuevo := p_cantidad * v_factor_nuevo;
    perform public.bolo_rechazar_stock_negativo(v_old.insumo_id, -v_stock_viejo);
    perform public.bolo_rechazar_stock_negativo(p_insumo_id, v_stock_nuevo);
  end if;

  v_costo := p_costo_usd;
  if v_costo is null
     and (p_base_usd is not null or p_iva_usd is not null or p_exento_usd is not null) then
    select recupera_iva_compras into v_recupera
      from public.cocina_config where id = 1;
    if v_recupera is null then
      v_recupera := true;
    end if;
    if v_recupera then
      v_costo := coalesce(p_base_usd, 0) + coalesce(p_exento_usd, 0);
    else
      v_costo := coalesce(p_base_usd, 0) + coalesce(p_iva_usd, 0) + coalesce(p_exento_usd, 0);
    end if;
  end if;

  update public.compras set
    insumo_id = p_insumo_id,
    proveedor_id = p_proveedor_id,
    fecha = p_fecha,
    cantidad = p_cantidad,
    precio_total_usd = p_precio_total_usd,
    precio_total_bs = p_precio_total_bs,
    tasa_bcv_usada = p_tasa_bcv_usada,
    modalidad_pago = p_modalidad_pago,
    notas = p_notas,
    numero_factura = nullif(btrim(p_numero_factura), ''),
    flete_usd = p_flete_usd,
    pagada = coalesce(p_pagada, true),
    fecha_pago = p_fecha_pago,
    base_usd = p_base_usd,
    iva_usd = p_iva_usd,
    exento_usd = p_exento_usd,
    costo_usd = v_costo,
    cantidad_por_compra_snap = v_factor_nuevo
  where id = p_id
  returning * into v_nueva;

  perform set_config('bolo.motivo', 'compra', true);

  if v_old.insumo_id = p_insumo_id then
    update public.insumos
      set stock_actual = coalesce(stock_actual, 0) + (v_stock_nuevo - v_stock_viejo)
      where id = p_insumo_id;
  else
    update public.insumos
      set stock_actual = coalesce(stock_actual, 0) - v_stock_viejo
      where id = v_old.insumo_id;
    update public.insumos
      set stock_actual = coalesce(stock_actual, 0) + v_stock_nuevo
      where id = p_insumo_id;
  end if;

  v_ids := array[p_insumo_id];
  if v_old.insumo_id is distinct from p_insumo_id then
    v_ids := v_ids || v_old.insumo_id;
  end if;

  foreach v_id in array v_ids loop
    select * into v_ult
      from public.compras
     where insumo_id = v_id
     order by fecha desc, created_at desc, id desc
     limit 1;
    if not found then
      continue;
    end if;

    v_monto := coalesce(v_ult.costo_usd, v_ult.precio_total_usd);
    v_unit := case
      when v_ult.cantidad > 0 then v_monto / v_ult.cantidad
      else v_monto
    end;
    select coalesce(v_ult.cantidad_por_compra_snap, cantidad_por_compra, 1)
      into v_factor
      from public.insumos where id = v_id;

    update public.insumos set
      ultima_fecha = v_ult.fecha,
      ultima_cantidad = v_ult.cantidad,
      ultima_precio_usd = v_unit,
      ultima_precio_bs = case
        when v_ult.cantidad > 0 and v_ult.precio_total_bs is not null
          then v_ult.precio_total_bs / v_ult.cantidad
        else null
      end,
      precio_compra_usd = v_unit,
      precio_base_usd = case
        when v_factor > 0 then v_unit / v_factor
        else v_unit
      end,
      -- Frescura: día civil del registro de la compra vigente, no su fecha de jornada.
      precio_actualizado = public._cocina_fecha_civil(v_ult.created_at),
      proveedor_id = coalesce(v_ult.proveedor_id, proveedor_id)
    where id = v_id;
  end loop;

  return v_nueva;
end;
$function$;
