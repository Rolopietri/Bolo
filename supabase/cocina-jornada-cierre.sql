-- Cocina · Jornada ligada al cierre de caja
--
-- Pedido de Lucia (t43u): al guardar el cierre de caja también se cierra la
-- jornada de cocina, se guarda una foto del stock (almacén y en uso) y se abre
-- la siguiente. Así el tablero puede mostrar lo que viene de la jornada
-- anterior frente a lo habilitado en esta, aunque el local trabaje después
-- de medianoche.
--
-- Este archivo solo AGREGA tablas, funciones, disparadores y una vista.
-- No reemplaza el motor de stock ni las funciones _prod_* / _venta_* que
-- en producción van por delante del repo. No toca datos de insumos.
--
-- Enganche: hoy `guardarCierre` (src/lib/data/cierre-caja.ts) hace un
-- INSERT en public.cierre_caja cuando es la primera vez de esa fecha, o un
-- UPDATE si ya existía. No hay función ni disparador de cierre en la base
-- (comprobado en vivo con pg_get_functiondef y pg_trigger). El disparador
-- `cierre_caja_cierra_jornada` corre AFTER INSERT. Un UPDATE (editar montos
-- o recargar el mismo cierre) no vuelve a cerrar ni toma otra foto.
--
-- Idempotencia:
--   • el mismo cierre_caja_id no cierra dos veces;
--   • borrar el cierre deja la jornada cerrada (cierre_caja_id pasa a null
--     y se conserva la fecha); si se vuelve a guardar esa fecha, se revincula
--     el id y no se cierra la jornada nueva.
--
-- Respaldo: si no hay cierre de caja, `_cocina_jornada_respaldo` cierra la
-- jornada abierta cuando ya pasó la hora de respaldo (por defecto 06:00 en
-- la zona de negocio_config, si no America/Caracas) Y esa jornada empezó
-- antes de esa medianoche local. Una jornada nacida de madrugada, después
-- de un cierre de caja a las 2:00, no se corta a las 6:00. Hoy el proyecto
-- no tiene pg_cron (comprobado en vivo); el respaldo se revisa en el primer
-- movimiento de stock que toque stock_actual o stock_procesado. Si más
-- adelante instalan pg_cron, hay un ejemplo al final de este archivo.
--
-- Lectura para el tablero: public.cocina_tablero_en_uso() y la vista
-- public.v_cocina_tablero_en_uso. El desglose asume FIFO: primero sale lo
-- que venía de la jornada anterior.
--
-- NO aplicar en producción sin la aprobación de Lucia.

-- ─── Config ────────────────────────────────────────────────────────
alter table public.cocina_config
  add column if not exists jornada_hora_respaldo time not null default '06:00:00';

comment on column public.cocina_config.jornada_hora_respaldo is
  'Hora local (zona de negocio_config) a partir de la cual, si no hubo cierre de caja, se cierra como respaldo una jornada empezada antes de esa medianoche.';

-- ─── Tablas ────────────────────────────────────────────────────────
create table if not exists public.cocina_jornadas (
  id uuid primary key default gen_random_uuid(),
  iniciado_at timestamptz not null default now(),
  cerrado_at timestamptz,
  cierre_caja_id uuid references public.cierre_caja (id) on delete set null,
  cierre_caja_fecha date,
  origen text,
  created_at timestamptz not null default now(),
  constraint cocina_jornadas_origen_ok check (
    origen is null or origen in ('cierre_caja', 'respaldo')
  ),
  constraint cocina_jornadas_cierre_ok check (
    (cerrado_at is null and origen is null and cierre_caja_id is null and cierre_caja_fecha is null)
    or (cerrado_at is not null and origen is not null)
  ),
  constraint cocina_jornadas_caja_origen_ok check (
    origen is distinct from 'cierre_caja' or cierre_caja_fecha is not null
  )
);

create unique index if not exists cocina_jornadas_una_abierta
  on public.cocina_jornadas ((true))
  where cerrado_at is null;

create unique index if not exists cocina_jornadas_un_cierre
  on public.cocina_jornadas (cierre_caja_id)
  where cierre_caja_id is not null;

create index if not exists idx_cocina_jornadas_iniciado
  on public.cocina_jornadas (iniciado_at desc);

comment on table public.cocina_jornadas is
  'Jornada de cocina. Se cierra al INSERT de cierre_caja o por respaldo. Un solo local; no lleva negocio_id porque negocio_config es una sola fila.';

create table if not exists public.cocina_jornada_saldos (
  id uuid primary key default gen_random_uuid(),
  jornada_id uuid not null references public.cocina_jornadas (id) on delete cascade,
  insumo_id uuid not null references public.insumos (id) on delete cascade,
  momento text not null,
  stock_actual numeric not null default 0,
  stock_procesado numeric not null default 0,
  procesado_habilitado numeric not null default 0,
  constraint cocina_jornada_saldos_momento_ok check (momento in ('apertura', 'cierre')),
  constraint cocina_jornada_saldos_unica unique (jornada_id, insumo_id, momento)
);

create index if not exists idx_cocina_jornada_saldos_jornada
  on public.cocina_jornada_saldos (jornada_id, momento);

comment on table public.cocina_jornada_saldos is
  'Foto de stock_actual y stock_procesado al abrir o cerrar una jornada. En la fila de apertura, procesado_habilitado acumula lo que entró a en uso durante esa jornada.';

alter table public.cocina_jornadas enable row level security;
alter table public.cocina_jornada_saldos enable row level security;

revoke all on table public.cocina_jornadas from anon, authenticated, public;
revoke all on table public.cocina_jornada_saldos from anon, authenticated, public;
grant select on table public.cocina_jornadas to authenticated;
grant select on table public.cocina_jornada_saldos to authenticated;

drop policy if exists "cocina_jornadas_select" on public.cocina_jornadas;
create policy "cocina_jornadas_select" on public.cocina_jornadas
  for select to authenticated using (true);

drop policy if exists "cocina_jornada_saldos_select" on public.cocina_jornada_saldos;
create policy "cocina_jornada_saldos_select" on public.cocina_jornada_saldos
  for select to authenticated using (true);

-- ─── Funciones ─────────────────────────────────────────────────────
create or replace function public._cocina_zona_horaria()
returns text
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(
    nullif(btrim((select zona_horaria from public.negocio_config order by id limit 1)), ''),
    'America/Caracas'
  );
$function$;

create or replace function public._cocina_hora_respaldo()
returns time
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(
    (select jornada_hora_respaldo from public.cocina_config order by id limit 1),
    '06:00:00'::time
  );
$function$;

-- Crea la primera jornada abierta si no hay ninguna, con foto de apertura.
create or replace function public._cocina_jornada_abierta()
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id uuid;
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

  insert into public.cocina_jornadas (iniciado_at)
  values (now())
  returning id into v_id;

  perform public._cocina_jornada_foto(v_id, 'apertura');
  return v_id;
end;
$function$;

-- Foto de todos los insumos activos, o de los que ya tienen fila en esta jornada.
create or replace function public._cocina_jornada_foto(p_jornada uuid, p_momento text)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if p_momento not in ('apertura', 'cierre') then
    raise exception 'momento de foto inválido: %', p_momento;
  end if;

  insert into public.cocina_jornada_saldos (
    jornada_id, insumo_id, momento, stock_actual, stock_procesado, procesado_habilitado
  )
  select p_jornada,
         i.id,
         p_momento,
         coalesce(i.stock_actual, 0),
         coalesce(i.stock_procesado, 0),
         case when p_momento = 'cierre'
              then coalesce((
                select a.procesado_habilitado
                  from public.cocina_jornada_saldos a
                 where a.jornada_id = p_jornada
                   and a.insumo_id = i.id
                   and a.momento = 'apertura'
              ), 0)
              else 0
         end
    from public.insumos i
   where i.activo is not false
      or exists (
        select 1 from public.cocina_jornada_saldos s
         where s.jornada_id = p_jornada and s.insumo_id = i.id
      )
  on conflict (jornada_id, insumo_id, momento) do update
    set stock_actual = excluded.stock_actual,
        stock_procesado = excluded.stock_procesado,
        procesado_habilitado = excluded.procesado_habilitado;
end;
$function$;

-- Cierra la jornada abierta, guarda la foto y abre la siguiente.
-- Idempotente: si p_cierre_caja_id ya cerró una jornada, no hace nada.
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
begin
  if p_origen not in ('cierre_caja', 'respaldo') then
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
     set cerrado_at = now(),
         origen = p_origen,
         cierre_caja_id = p_cierre_caja_id,
         cierre_caja_fecha = case when p_origen = 'cierre_caja' then v_fecha else cierre_caja_fecha end
   where id = v_abierta
     and cerrado_at is null;

  if not found then
    return null;
  end if;

  perform public._cocina_jornada_foto(v_abierta, 'cierre');

  insert into public.cocina_jornadas (iniciado_at)
  values (now())
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

-- Respaldo: ver la regla en el encabezado de este archivo.
create or replace function public._cocina_jornada_respaldo()
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_tz text := public._cocina_zona_horaria();
  v_hora time := public._cocina_hora_respaldo();
  v_local timestamp;
  v_corte timestamptz;
  v_medianoche timestamptz;
  v_iniciado timestamptz;
  v_id uuid;
begin
  v_local := timezone(v_tz, now());
  v_corte := timezone(v_tz, date_trunc('day', v_local) + v_hora);
  v_medianoche := timezone(v_tz, date_trunc('day', v_local));

  select id, iniciado_at into v_id, v_iniciado
    from public.cocina_jornadas
   where cerrado_at is null
   order by iniciado_at desc
   limit 1
   for update;

  if v_id is null then
    return null;
  end if;
  if now() < v_corte then
    return null;
  end if;
  if v_iniciado >= v_medianoche then
    return null;
  end if;

  return public._cocina_jornada_cerrar('respaldo', null, null);
end;
$function$;

-- ─── Disparadores ──────────────────────────────────────────────────
create or replace function public.trg_cierre_caja_jornada()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  -- Ya está ligado a este id (no debería pasar en un INSERT nuevo).
  if exists (
    select 1 from public.cocina_jornadas where cierre_caja_id = new.id
  ) then
    return new;
  end if;

  -- El cierre de esta fecha se borró y se volvió a guardar: revincula, no cierra otra vez.
  update public.cocina_jornadas
     set cierre_caja_id = new.id
   where cerrado_at is not null
     and origen = 'cierre_caja'
     and cierre_caja_fecha = new.fecha
     and cierre_caja_id is null;
  if found then
    return new;
  end if;

  perform public._cocina_jornada_cerrar('cierre_caja', new.id, new.fecha);
  return new;
end;
$function$;

drop trigger if exists cierre_caja_cierra_jornada on public.cierre_caja;
create trigger cierre_caja_cierra_jornada
  after insert on public.cierre_caja
  for each row execute function public.trg_cierre_caja_jornada();

-- Revisa el respaldo y acumula lo que entra a en uso en esta jornada.
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
  perform public._cocina_jornada_respaldo();

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

drop trigger if exists insumos_jornada_en_uso on public.insumos;
create trigger insumos_jornada_en_uso
  after insert or update of stock_actual, stock_procesado on public.insumos
  for each row execute function public.trg_insumos_jornada();

-- ─── Lectura para el tablero ───────────────────────────────────────
create or replace function public.cocina_tablero_en_uso()
returns table (
  insumo_id uuid,
  nombre text,
  unidad_base text,
  stock_actual numeric,
  stock_procesado numeric,
  viene_de_anterior numeric,
  habilitado_esta numeric,
  procesado_habilitado numeric,
  jornada_id uuid,
  jornada_iniciado_at timestamptz,
  pendientes_abiertos numeric,
  lotes_pendientes integer
)
language plpgsql
stable
security invoker
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_j uuid;
  v_inicio timestamptz;
begin
  select j.id, j.iniciado_at into v_j, v_inicio
    from public.cocina_jornadas j
   where j.cerrado_at is null
   order by j.iniciado_at desc
   limit 1;

  return query
  with abiertos as (
    select p.insumo_id,
           sum(p.crudo) as crudo,
           count(*)::int as lotes
      from public.procesamientos_abiertos p
     where v_inicio is not null
       and p.abierto_at < v_inicio
     group by p.insumo_id
  )
  select i.id,
         i.nombre,
         i.unidad_base,
         coalesce(i.stock_actual, 0),
         coalesce(i.stock_procesado, 0),
         greatest(0,
           coalesce(s.stock_procesado, 0)
           - greatest(0,
               coalesce(s.stock_procesado, 0)
               + coalesce(s.procesado_habilitado, 0)
               - coalesce(i.stock_procesado, 0)
             )
         ),
         coalesce(i.stock_procesado, 0)
           - greatest(0,
               coalesce(s.stock_procesado, 0)
               - greatest(0,
                   coalesce(s.stock_procesado, 0)
                   + coalesce(s.procesado_habilitado, 0)
                   - coalesce(i.stock_procesado, 0)
                 )
             ),
         coalesce(s.procesado_habilitado, 0),
         v_j,
         v_inicio,
         coalesce(a.crudo, 0),
         coalesce(a.lotes, 0)
    from public.insumos i
    left join public.cocina_jornada_saldos s
      on s.jornada_id = v_j
     and s.insumo_id = i.id
     and s.momento = 'apertura'
    left join abiertos a on a.insumo_id = i.id
   where i.activo is not false
     and (
       coalesce(i.stock_procesado, 0) <> 0
       or coalesce(s.stock_procesado, 0) <> 0
       or coalesce(s.procesado_habilitado, 0) <> 0
       or coalesce(a.crudo, 0) <> 0
     )
   order by i.nombre;
end;
$function$;

create or replace view public.v_cocina_tablero_en_uso
  with (security_invoker = true)
as
  select * from public.cocina_tablero_en_uso();

grant select on public.v_cocina_tablero_en_uso to authenticated;
grant execute on function public.cocina_tablero_en_uso() to authenticated;

revoke all on function public._cocina_zona_horaria() from public, anon;
revoke all on function public._cocina_hora_respaldo() from public, anon;
revoke all on function public._cocina_jornada_abierta() from public, anon, authenticated;
revoke all on function public._cocina_jornada_foto(uuid, text) from public, anon, authenticated;
revoke all on function public._cocina_jornada_cerrar(text, uuid, date) from public, anon, authenticated;
revoke all on function public._cocina_jornada_respaldo() from public, anon, authenticated;
revoke all on function public.trg_cierre_caja_jornada() from public, anon, authenticated;
revoke all on function public.trg_insumos_jornada() from public, anon, authenticated;

grant execute on function public._cocina_zona_horaria() to authenticated;
grant execute on function public._cocina_hora_respaldo() to authenticated;

-- Primera jornada, si aún no hay ninguna: foto de apertura con el saldo actual
-- (ese saldo se verá como «viene de la jornada anterior» hasta el primer cierre).
do $bootstrap$
begin
  perform public._cocina_jornada_abierta();
end;
$bootstrap$;

-- pg_cron no está instalado hoy en el proyecto abmpkbwhkghwtzosjpxt.
-- Si más adelante lo habilitan, esto toma la foto cerca de las 06:00 America/Caracas
-- (10:00 UTC) sin esperar al primer movimiento:
--
--   select cron.schedule(
--     'cocina-jornada-respaldo',
--     '0,15,30,45 10-15 * * *',
--     $cron$select public._cocina_jornada_respaldo()$cron$
--   );
