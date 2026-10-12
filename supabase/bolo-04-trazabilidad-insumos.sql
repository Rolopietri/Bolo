-- ═══════════════════════════════════════════════════════════════════
-- BOLO-04 · Trazabilidad de insumos (autorizado por la dueña el 9 y 12 oct 2026)
-- ═══════════════════════════════════════════════════════════════════
-- 1. insumo_proveedores: los proveedores que despachan cada insumo. Hasta ahora
--    solo existía insumos.proveedor_id, que cada compra sobrescribe con el
--    último proveedor: un proveedor sin compras "desaparecía".
-- 2. stock_movimientos.valor_usd: el valor de una pérdida se congela al
--    registrarla (antes se recalculaba con el precio de hoy y el historial
--    cambiaba hacia atrás). created_by pasa a llenarse solo.
-- 3. stock_auditoria.motivo: cada función que mueve stock deja dicho por qué
--    (compra, venta, pérdida, conteo…) vía la variable de transacción
--    bolo.motivo, que el disparador de auditoría lee.
-- 4. nombres_usuarios(): nombre visible de quien hizo cada cambio.
--
-- No borra datos. Idempotente: se puede correr más de una vez.

-- ── 1. Proveedores por insumo ──────────────────────────────────────
create table if not exists public.insumo_proveedores (
  insumo_id     uuid not null references public.insumos(id) on delete cascade,
  proveedor_id  uuid not null references public.proveedores(id) on delete cascade,
  ultima_compra date,
  created_at    timestamptz not null default now(),
  primary key (insumo_id, proveedor_id)
);
create index if not exists insumo_proveedores_proveedor_idx
  on public.insumo_proveedores (proveedor_id);

alter table public.insumo_proveedores enable row level security;
drop policy if exists insprov_select on public.insumo_proveedores;
drop policy if exists insprov_insert on public.insumo_proveedores;
drop policy if exists insprov_update on public.insumo_proveedores;
drop policy if exists insprov_delete on public.insumo_proveedores;
create policy insprov_select on public.insumo_proveedores for select to authenticated using (true);
create policy insprov_insert on public.insumo_proveedores for insert to authenticated with check (true);
create policy insprov_update on public.insumo_proveedores for update to authenticated using (true) with check (true);
create policy insprov_delete on public.insumo_proveedores for delete to authenticated using (true);

-- Vínculos que ya se conocen: compras pasadas y el proveedor de cada insumo.
insert into public.insumo_proveedores (insumo_id, proveedor_id, ultima_compra)
select insumo_id, proveedor_id, max(fecha)
  from public.compras
 where proveedor_id is not null
 group by insumo_id, proveedor_id
on conflict (insumo_id, proveedor_id) do update
  set ultima_compra = greatest(public.insumo_proveedores.ultima_compra, excluded.ultima_compra);

insert into public.insumo_proveedores (insumo_id, proveedor_id)
select id, proveedor_id from public.insumos where proveedor_id is not null
on conflict (insumo_id, proveedor_id) do nothing;

create or replace function public.vincular_proveedor_insumo()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.proveedor_id is null then
    return new;
  end if;
  if tg_table_name = 'compras' then
    insert into public.insumo_proveedores (insumo_id, proveedor_id, ultima_compra)
    values (new.insumo_id, new.proveedor_id, new.fecha)
    on conflict (insumo_id, proveedor_id) do update
      set ultima_compra = greatest(public.insumo_proveedores.ultima_compra, excluded.ultima_compra);
  else
    insert into public.insumo_proveedores (insumo_id, proveedor_id)
    values (new.id, new.proveedor_id)
    on conflict (insumo_id, proveedor_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists compra_vincula_proveedor on public.compras;
create trigger compra_vincula_proveedor
  after insert on public.compras
  for each row execute function public.vincular_proveedor_insumo();

drop trigger if exists insumo_vincula_proveedor on public.insumos;
create trigger insumo_vincula_proveedor
  after insert or update of proveedor_id on public.insumos
  for each row execute function public.vincular_proveedor_insumo();

-- ── 2. Valor congelado de las pérdidas ─────────────────────────────
alter table public.stock_movimientos add column if not exists valor_usd numeric;
alter table public.stock_movimientos alter column created_by set default auth.uid();

create or replace function public.valorar_movimiento_stock()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_precio numeric;
begin
  new.created_by := coalesce(new.created_by, auth.uid());
  -- Solo las salidas de la capa física (pérdidas y faltantes de conteo).
  if new.valor_usd is null and new.capa = 'total' and new.cantidad < 0
     and new.tipo in ('perdida', 'mal_estado', 'merma', 'vencimiento', 'otro', 'ajuste') then
    select precio_base_usd into v_precio from public.insumos where id = new.insumo_id;
    if v_precio is not null then
      new.valor_usd := round(abs(new.cantidad) * v_precio, 4);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists stock_mov_valorar on public.stock_movimientos;
create trigger stock_mov_valorar
  before insert on public.stock_movimientos
  for each row execute function public.valorar_movimiento_stock();

-- Las pérdidas ya registradas se valoran con el precio que tenía el insumo
-- ese día: el "precio anterior" del primer cambio de precio posterior, o el
-- precio actual si no hubo cambios después.
update public.stock_movimientos m
   set valor_usd = round(abs(m.cantidad) * (
         coalesce(
           (select h.precio_compra_anterior_usd
              from public.insumo_precio_historico h
             where h.insumo_id = m.insumo_id and h.fecha > m.created_at
             order by h.fecha asc limit 1),
           i.precio_compra_usd
         ) / nullif(i.cantidad_por_compra, 0)
       ), 4)
  from public.insumos i
 where i.id = m.insumo_id
   and m.valor_usd is null
   and m.capa = 'total'
   and m.cantidad < 0
   and m.tipo in ('perdida', 'mal_estado', 'merma', 'vencimiento', 'otro', 'ajuste');

-- ── 3. Motivo en la auditoría de stock ─────────────────────────────
alter table public.stock_auditoria add column if not exists motivo text;

create or replace function public.log_stock_auditoria()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_motivo text := nullif(current_setting('bolo.motivo', true), '');
begin
  if (tg_op = 'INSERT') then
    -- Solo registramos el alta si nace con algo de stock.
    if coalesce(new.stock_actual, 0) <> 0
       or coalesce(new.stock_comprometido, 0) <> 0 then
      insert into public.stock_auditoria (
        insumo_id, insumo_nombre, unidad_base,
        stock_anterior, stock_nuevo,
        comprometido_anterior, comprometido_nuevo,
        origen, changed_by, motivo
      ) values (
        new.id, new.nombre, new.unidad_base,
        null, new.stock_actual,
        null, new.stock_comprometido,
        'alta', v_actor, coalesce(v_motivo, 'alta')
      );
    end if;
    return new;
  end if;

  -- UPDATE: registrar solo si cambió alguna de las dos capas de stock.
  if new.stock_actual is distinct from old.stock_actual
     or coalesce(new.stock_comprometido, 0)
        is distinct from coalesce(old.stock_comprometido, 0) then
    insert into public.stock_auditoria (
      insumo_id, insumo_nombre, unidad_base,
      stock_anterior, stock_nuevo,
      comprometido_anterior, comprometido_nuevo,
      origen, changed_by, motivo
    ) values (
      new.id, new.nombre, new.unidad_base,
      old.stock_actual, new.stock_actual,
      old.stock_comprometido, new.stock_comprometido,
      case when v_actor is not null then 'app' else 'directo' end,
      v_actor,
      coalesce(v_motivo, case when v_actor is not null then 'edicion' end)
    );
  end if;

  return new;
end;
$$;

-- Cada función que mueve stock declara su motivo al empezar. Se inyecta una
-- línea después del primer "begin" de su definición actual (no se reescriben
-- a mano para no arrastrar diferencias con lo desplegado). Si ya la tiene, se
-- salta.
do $$
declare
  r record;
  def text;
  nuevo text;
begin
  for r in
    select * from (values
      ('apply_compra_to_insumo',    $m$'compra'$m$),
      ('revertir_compra_de_insumo', $m$'compra_revertida'$m$),
      ('registrar_perdida_stock',   $m$'perdida:' || coalesce(p_tipo, 'otro')$m$),
      ('borrar_movimiento_stock',   $m$'perdida_deshecha'$m$),
      ('ajustar_stock_conteo',      $m$'conteo'$m$),
      ('ajustar_plan_completado',   $m$'plan'$m$),
      ('descontar_stock_por_venta', $m$case when coalesce(new.es_merma, false) then 'merma_receta' else 'venta' end$m$),
      ('revertir_stock_por_venta',  $m$'venta_revertida'$m$)
    ) as v(fn, expr)
  loop
    select pg_get_functiondef(p.oid) into def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = r.fn;
    if def is null then
      raise exception 'BOLO-04: no existe la función %', r.fn;
    end if;
    continue when position('bolo.motivo' in def) > 0;
    nuevo := regexp_replace(
      def, E'\nbegin\n',
      E'\nbegin\n  perform set_config(''bolo.motivo'', ' || r.expr || E', true);\n');
    if nuevo = def then
      raise exception 'BOLO-04: no encontré el begin de %', r.fn;
    end if;
    execute nuevo;
  end loop;
end;
$$;

-- ── 4. Nombre visible de cada usuario ──────────────────────────────
create or replace function public.nombres_usuarios(p_ids uuid[])
returns table (id uuid, nombre text)
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select u.id,
         coalesce(np.nombre,
                  u.raw_user_meta_data ->> 'nombre',
                  u.raw_user_meta_data ->> 'name',
                  split_part(u.email, '@', 1))
    from auth.users u
    left join public.negocio_persona np on np.user_id = u.id
   where u.id = any (p_ids);
$$;
revoke all on function public.nombres_usuarios(uuid[]) from public, anon;
grant execute on function public.nombres_usuarios(uuid[]) to authenticated;
