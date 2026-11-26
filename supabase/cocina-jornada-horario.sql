-- Cocina · Horario del local, alerta y cierre automático de jornada
--
-- Pedido de Lucia (t44u): en el perfil del negocio se indica la hora de
-- apertura habitual y la hora máxima de cierre, con una observación.
-- Si se pasa esa hora y no hay cierre de caja, Bolo cierra solo el inventario
-- de la jornada (origen `automatico`). Media hora antes avisa, como un
-- despertador: «Hacer cierre» o «Recordar en 1 hora» (hasta 6 posposiciones,
-- registradas). Reemplaza el respaldo fijo de las 6:00.
--
-- También agrega la fecha de negocio en `cocina_jornadas` (fecha civil de
-- `iniciado_at` en la zona del negocio) y las funciones `jornada_actual()`,
-- `jornada_de(ts)` y `jornada_fecha(ts default now())`. Este archivo NO cambia
-- compras, ventas, administración ni demás áreas para que las usen: eso va
-- en otro PR cuando Lucia decida.
--
-- Este archivo es aditivo e idempotente sobre `cocina-jornada-cierre.sql`.
-- No pisa el motor de stock ni las `_prod_*`. No aplicar en producción
-- sin la aprobación de Lucia.
--
-- El cierre automático se revisa en el primer movimiento de stock (mismo
-- disparador de insumos) y al cargar la app (`cocina_jornada_revisar`).
-- pg_cron no está instalado hoy; al final hay un ejemplo, sin activarlo.

-- ─── Perfil del negocio: horario ───────────────────────────────────
alter table public.negocio_config
  add column if not exists hora_apertura_habitual time,
  add column if not exists hora_cierre_maxima time,
  add column if not exists jornada_horario_nota text;

alter table public.negocio_config
  drop constraint if exists negocio_config_horario_nota_ok;
alter table public.negocio_config
  add constraint negocio_config_horario_nota_ok
  check (jornada_horario_nota is null or char_length(jornada_horario_nota) <= 500);

comment on column public.negocio_config.hora_apertura_habitual is
  'Hora habitual de apertura del local, en la zona de negocio_config.';
comment on column public.negocio_config.hora_cierre_maxima is
  'Hora máxima habitual de cierre. Si se pasa y no hay cierre de caja, se cierra sola la jornada de inventario. Si es menor o igual que la de apertura, se entiende que cruza medianoche.';
comment on column public.negocio_config.jornada_horario_nota is
  'Observación del horario (por ejemplo: los viernes se cierra más tarde).';

-- ─── Fecha de negocio en la jornada ────────────────────────────────
alter table public.cocina_jornadas
  add column if not exists fecha date;

update public.cocina_jornadas j
   set fecha = (j.iniciado_at at time zone coalesce(
                 nullif(btrim((select zona_horaria from public.negocio_config order by id limit 1)), ''),
                 'America/Caracas'
               ))::date
 where j.fecha is null;

alter table public.cocina_jornadas
  alter column fecha set default ((now() at time zone 'America/Caracas')::date);

-- Tras el backfill no deberían quedar nulos.
alter table public.cocina_jornadas
  alter column fecha set not null;

create index if not exists idx_cocina_jornadas_fecha
  on public.cocina_jornadas (fecha);

comment on column public.cocina_jornadas.fecha is
  'Fecha de negocio: la fecha civil de iniciado_at en la zona del negocio. Una jornada que empieza el 26 a las 10:00 y cierra el 27 a las 2:00 tiene fecha el 26.';

alter table public.cocina_jornadas drop constraint if exists cocina_jornadas_origen_ok;
alter table public.cocina_jornadas
  add constraint cocina_jornadas_origen_ok
  check (origen is null or origen in ('cierre_caja', 'respaldo', 'automatico'));

-- ─── Posposiciones ─────────────────────────────────────────────────
create table if not exists public.cocina_jornada_posposiciones (
  id uuid primary key default gen_random_uuid(),
  jornada_id uuid not null references public.cocina_jornadas (id) on delete cascade,
  n integer not null,
  recordada_at timestamptz not null default now(),
  limite_anterior timestamptz not null,
  limite_nuevo timestamptz not null,
  created_by uuid references auth.users (id) on delete set null,
  constraint cocina_jornada_posposiciones_n_ok check (n >= 1 and n <= 6),
  constraint cocina_jornada_posposiciones_unica unique (jornada_id, n)
);

create index if not exists idx_cocina_jornada_posposiciones_jornada
  on public.cocina_jornada_posposiciones (jornada_id, n);

comment on table public.cocina_jornada_posposiciones is
  'Cada «Recordar en 1 hora» de la alerta de cierre. Tope de 6 por jornada.';

alter table public.cocina_jornada_posposiciones enable row level security;
revoke all on table public.cocina_jornada_posposiciones from anon, authenticated, public;
grant select on table public.cocina_jornada_posposiciones to authenticated;

drop policy if exists "cocina_jornada_posposiciones_select" on public.cocina_jornada_posposiciones;
create policy "cocina_jornada_posposiciones_select" on public.cocina_jornada_posposiciones
  for select to authenticated using (true);

-- ─── Fecha civil y reapertura con fecha ────────────────────────────
create or replace function public._cocina_fecha_civil(p_ts timestamptz)
returns date
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  select (p_ts at time zone public._cocina_zona_horaria())::date;
$function$;

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
    return v_id;
  end if;

  insert into public.cocina_jornadas (iniciado_at, fecha)
  values (v_ts, public._cocina_fecha_civil(v_ts))
  returning id into v_id;

  perform public._cocina_jornada_foto(v_id, 'apertura');
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

  return v_abierta;
end;
$function$;

-- ─── Límite efectivo (hora máxima + posposiciones) ─────────────────
create or replace function public._cocina_horario_negocio()
returns table (hora_apertura time, hora_cierre time, nota text)
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  select hora_apertura_habitual, hora_cierre_maxima, jornada_horario_nota
    from public.negocio_config
   order by id
   limit 1;
$function$;

-- Hora máxima de esa jornada, antes de posponer. Si la de cierre es menor o
-- igual que la de apertura, cae al día civil siguiente. Si el límite quedara
-- antes de iniciado_at, se recorre un día.
create or replace function public._cocina_jornada_limite_base(p_iniciado timestamptz, p_fecha date)
returns timestamptz
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_tz text := public._cocina_zona_horaria();
  v_ap time;
  v_ci time;
  v_dia date;
  v_limite timestamptz;
begin
  select hora_apertura, hora_cierre into v_ap, v_ci from public._cocina_horario_negocio();
  if v_ap is null or v_ci is null then
    return null;
  end if;
  v_dia := p_fecha;
  if v_ci <= v_ap then
    v_dia := p_fecha + 1;
  end if;
  v_limite := timezone(v_tz, (v_dia::timestamp + v_ci));
  if v_limite <= p_iniciado then
    v_limite := v_limite + interval '1 day';
  end if;
  return v_limite;
end;
$function$;

create or replace function public._cocina_jornada_posposiciones_n(p_jornada uuid)
returns integer
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  select count(*)::int from public.cocina_jornada_posposiciones where jornada_id = p_jornada;
$function$;

create or replace function public._cocina_jornada_limite_efectivo(p_jornada uuid)
returns timestamptz
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_iniciado timestamptz;
  v_fecha date;
  v_base timestamptz;
  v_n int;
begin
  select iniciado_at, fecha into v_iniciado, v_fecha
    from public.cocina_jornadas where id = p_jornada;
  if v_iniciado is null then
    return null;
  end if;
  v_base := public._cocina_jornada_limite_base(v_iniciado, v_fecha);
  if v_base is null then
    return null;
  end if;
  v_n := public._cocina_jornada_posposiciones_n(p_jornada);
  return v_base + (v_n * interval '1 hour');
end;
$function$;

create or replace function public._cocina_jornada_automatico()
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id uuid;
  v_limite timestamptz;
begin
  select id into v_id
    from public.cocina_jornadas
   where cerrado_at is null
   order by iniciado_at desc
   limit 1
   for update;
  if v_id is null then
    return null;
  end if;
  v_limite := public._cocina_jornada_limite_efectivo(v_id);
  if v_limite is null or now() < v_limite then
    return null;
  end if;
  return public._cocina_jornada_cerrar('automatico', null, null);
end;
$function$;

-- El respaldo de las 6:00 queda reemplazado por el cierre automático.
create or replace function public._cocina_jornada_respaldo()
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  return public._cocina_jornada_automatico();
end;
$function$;

create or replace function public.cocina_jornada_posponer()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id uuid;
  v_n int;
  v_base timestamptz;
  v_ant timestamptz;
  v_nuevo timestamptz;
  v_iniciado timestamptz;
  v_fecha date;
begin
  v_id := public._cocina_jornada_abierta();
  select iniciado_at, fecha into v_iniciado, v_fecha
    from public.cocina_jornadas where id = v_id for update;
  if (select cerrado_at from public.cocina_jornadas where id = v_id) is not null then
    return jsonb_build_object('ok', false, 'error', 'cerrada');
  end if;
  v_base := public._cocina_jornada_limite_base(v_iniciado, v_fecha);
  if v_base is null then
    return jsonb_build_object('ok', false, 'error', 'sin_horario');
  end if;
  v_n := public._cocina_jornada_posposiciones_n(v_id);
  if v_n >= 6 then
    return jsonb_build_object('ok', false, 'error', 'tope', 'posposiciones', v_n);
  end if;
  v_ant := v_base + (v_n * interval '1 hour');
  v_nuevo := v_base + ((v_n + 1) * interval '1 hour');
  insert into public.cocina_jornada_posposiciones (
    jornada_id, n, limite_anterior, limite_nuevo, created_by
  ) values (v_id, v_n + 1, v_ant, v_nuevo, auth.uid());
  return jsonb_build_object(
    'ok', true,
    'jornada_id', v_id,
    'posposiciones', v_n + 1,
    'limite_efectivo', v_nuevo
  );
end;
$function$;

create or replace function public.cocina_jornada_estado()
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
  debe_cerrar boolean
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
begin
  select j.id, j.fecha, j.iniciado_at into v_id, v_fecha, v_ini
    from public.cocina_jornadas j
   where j.cerrado_at is null
   order by j.iniciado_at desc
   limit 1;
  select h.hora_apertura, h.hora_cierre, h.nota into v_ap, v_ci, v_nota
    from public._cocina_horario_negocio() h;
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
  return next;
end;
$function$;

-- Revisa el automático (posible cierre) y devuelve el estado de la jornada
-- que quedó abierta. cerro_jornada_id es la que se cerró en esta llamada, si hubo.
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
    'debe_cerrar', v_est.debe_cerrar
  );
end;
$function$;

-- ─── jornada_actual / jornada_de / jornada_fecha ───────────────────
create or replace function public.jornada_actual()
returns table (
  id uuid,
  fecha date,
  iniciado_at timestamptz,
  cerrado_at timestamptz,
  origen text
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
    select j.id, j.fecha, j.iniciado_at, j.cerrado_at, j.origen
      from public.cocina_jornadas j
     where j.id = v_id;
end;
$function$;

create or replace function public.jornada_de(p_ts timestamptz)
returns table (
  id uuid,
  fecha date,
  iniciado_at timestamptz,
  cerrado_at timestamptz,
  origen text
)
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  select j.id, j.fecha, j.iniciado_at, j.cerrado_at, j.origen
    from public.cocina_jornadas j
   where j.iniciado_at <= p_ts
     and (j.cerrado_at is null or j.cerrado_at > p_ts)
   order by j.iniciado_at desc
   limit 1;
$function$;

create or replace function public.jornada_fecha(p_ts timestamptz default now())
returns date
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_fecha date;
begin
  select j.fecha into v_fecha from public.jornada_de(p_ts) j;
  if v_fecha is not null then
    return v_fecha;
  end if;
  return public._cocina_fecha_civil(p_ts);
end;
$function$;

-- ─── Disparadores actualizados ─────────────────────────────────────
create or replace function public.trg_cierre_caja_jornada()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if exists (
    select 1 from public.cocina_jornadas where cierre_caja_id = new.id
  ) then
    return new;
  end if;

  -- El cierre de esta fecha se borró y se volvió a guardar.
  update public.cocina_jornadas
     set cierre_caja_id = new.id
   where cerrado_at is not null
     and origen = 'cierre_caja'
     and cierre_caja_fecha = new.fecha
     and cierre_caja_id is null;
  if found then
    return new;
  end if;

  -- Cierre de caja posterior a un cierre automático (o al viejo respaldo)
  -- de esa misma fecha de negocio: se revincula, no se cierra la jornada nueva.
  update public.cocina_jornadas
     set cierre_caja_id = new.id,
         cierre_caja_fecha = new.fecha,
         origen = 'cierre_caja'
   where cerrado_at is not null
     and origen in ('automatico', 'respaldo')
     and cierre_caja_id is null
     and fecha = new.fecha;
  if found then
    return new;
  end if;

  perform public._cocina_jornada_cerrar('cierre_caja', new.id, new.fecha);
  return new;
end;
$function$;

create or replace function public.trg_insumos_jornada()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_j uuid;
  v_delta numeric;
  v_motivo text;
begin
  perform public._cocina_jornada_automatico();

  if tg_op <> 'UPDATE' then
    return new;
  end if;
  if new.stock_procesado is not distinct from old.stock_procesado then
    return new;
  end if;

  v_j := public._cocina_jornada_abierta();
  v_delta := coalesce(new.stock_procesado, 0) - coalesce(old.stock_procesado, 0);
  v_motivo := lower(coalesce(nullif(current_setting('bolo.motivo', true), ''), ''));

  insert into public.cocina_jornada_saldos (
    jornada_id, insumo_id, momento, stock_actual, stock_procesado, procesado_habilitado
  )
  values (
    v_j, new.id, 'apertura',
    coalesce(new.stock_actual, 0),
    greatest(0, coalesce(old.stock_procesado, 0)),
    0
  )
  on conflict (jornada_id, insumo_id, momento) do nothing;

  if v_delta > 0 then
    update public.cocina_jornada_saldos
       set procesado_habilitado = procesado_habilitado + v_delta
     where jornada_id = v_j
       and insumo_id = new.id
       and momento = 'apertura';
  elsif v_delta < 0 and (
      v_motivo like '%revert%'
      or v_motivo like '%deshac%'
  ) then
    update public.cocina_jornada_saldos
       set procesado_habilitado = greatest(0, procesado_habilitado + v_delta)
     where jornada_id = v_j
       and insumo_id = new.id
       and momento = 'apertura';
  end if;

  return new;
end;
$function$;

-- ─── Permisos ──────────────────────────────────────────────────────
revoke all on function public._cocina_fecha_civil(timestamptz) from public, anon;
revoke all on function public._cocina_horario_negocio() from public, anon;
revoke all on function public._cocina_jornada_limite_base(timestamptz, date) from public, anon;
revoke all on function public._cocina_jornada_posposiciones_n(uuid) from public, anon;
revoke all on function public._cocina_jornada_limite_efectivo(uuid) from public, anon;
revoke all on function public._cocina_jornada_automatico() from public, anon, authenticated;
revoke all on function public._cocina_jornada_respaldo() from public, anon, authenticated;
revoke all on function public._cocina_jornada_abierta() from public, anon, authenticated;
revoke all on function public._cocina_jornada_cerrar(text, uuid, date) from public, anon, authenticated;

grant execute on function public._cocina_fecha_civil(timestamptz) to authenticated;
grant execute on function public._cocina_horario_negocio() to authenticated;
grant execute on function public._cocina_jornada_limite_base(timestamptz, date) to authenticated;
grant execute on function public._cocina_jornada_posposiciones_n(uuid) to authenticated;
grant execute on function public._cocina_jornada_limite_efectivo(uuid) to authenticated;

grant execute on function public.jornada_actual() to authenticated;
grant execute on function public.jornada_de(timestamptz) to authenticated;
grant execute on function public.jornada_fecha(timestamptz) to authenticated;
grant execute on function public.cocina_jornada_estado() to authenticated;
grant execute on function public.cocina_jornada_revisar() to authenticated;
grant execute on function public.cocina_jornada_posponer() to authenticated;

-- pg_cron no está instalado hoy en abmpkbwhkghwtzosjpxt. No se activa.
-- Si más adelante lo habilitan, esto revisa el cierre automático cada 15 min:
--
--   select cron.schedule(
--     'cocina-jornada-automatico',
--     '*/15 * * * *',
--     $cron$select public._cocina_jornada_automatico()$cron$
--   );
