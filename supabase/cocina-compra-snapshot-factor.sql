-- Cocina · Snapshot del factor de empaque en cada compra
-- ════════════════════════════════════════════════════════════════
-- PROBLEMA: al insertar una compra, `apply_compra_to_insumo` suma
--   cantidad × insumos.cantidad_por_compra  (el factor VIGENTE en ese momento).
-- Al borrarla, `revertir_compra_de_insumo` restaba
--   cantidad × insumos.cantidad_por_compra  (el factor VIGENTE AL BORRAR).
-- Si entre comprar y borrar se reconfiguraba el empaque (ej. cantidad_por_compra
-- de 1000 → 500 g/unidad), la reversión restaba una cantidad distinta a la que
-- se sumó → quedaban gramos fantasma (o de menos) en el stock.
--
-- SOLUCIÓN: congelar (snapshot) el factor de empaque en la propia fila de la
-- compra al insertarla, y que la reversión use ese snapshot, no el valor vivo.
--
-- No hace falta tocar `apply_compra_to_insumo`: corre en el MISMO insert, cuando
-- el factor vivo == el snapshot recién congelado, así que ya suma la cantidad
-- correcta. Solo el revert (que corre después, quizá con el factor ya cambiado)
-- necesitaba el snapshot.
--
-- Idempotente.

-- 1) Columna para el snapshot.
alter table public.compras
  add column if not exists cantidad_por_compra_snap numeric;

-- 2) Trigger BEFORE INSERT: congela el factor vigente del insumo en la compra.
--    (apply_compra_to_insumo es AFTER INSERT y no puede escribir en la fila, por
--    eso el snapshot va en un trigger BEFORE aparte.)
create or replace function public.snapshot_cantidad_por_compra()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.cantidad_por_compra_snap is null then
    select cantidad_por_compra
      into new.cantidad_por_compra_snap
      from public.insumos
     where id = new.insumo_id;
  end if;
  return new;
end;
$$;

drop trigger if exists compra_snapshot_factor on public.compras;
create trigger compra_snapshot_factor
  before insert on public.compras
  for each row execute function public.snapshot_cantidad_por_compra();

-- 3) Backfill de compras existentes con el factor ACTUAL del insumo. Es la mejor
--    aproximación posible (el factor original ya no se conoce). Si el empaque no
--    cambió, es exacto; si cambió, esas compras viejas ya tenían el riesgo y esto
--    al menos las deja consistentes de aquí en adelante.
update public.compras c
   set cantidad_por_compra_snap = i.cantidad_por_compra
  from public.insumos i
 where c.insumo_id = i.id
   and c.cantidad_por_compra_snap is null;

-- 4) Revert: usar el snapshot congelado (fallback al factor vigente por si
--    alguna fila no tuviera snapshot). Lo demás queda idéntico a la versión
--    canónica de cocina-compra-revertir-al-borrar.sql.
create or replace function public.revertir_compra_de_insumo()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_cantidad_por_compra numeric;
  v_stock_sub numeric;
  v_es_ultima boolean;
begin
  select cantidad_por_compra into v_cantidad_por_compra
  from public.insumos where id = old.insumo_id;

  -- Usar el factor CONGELADO al momento de la compra, no el vigente.
  v_stock_sub := old.cantidad
    * coalesce(old.cantidad_por_compra_snap, v_cantidad_por_compra, 1);

  select (old.fecha = ultima_fecha and old.cantidad = ultima_cantidad)
    into v_es_ultima
  from public.insumos where id = old.insumo_id;

  if coalesce(v_es_ultima, false) then
    update public.insumos set
      stock_actual = greatest(0, coalesce(stock_actual, 0) - v_stock_sub),
      ultima_fecha = penultima_fecha,
      ultima_cantidad = penultima_cantidad,
      ultima_precio_usd = penultima_precio_usd,
      ultima_precio_bs = penultima_precio_bs,
      precio_compra_usd = penultima_precio_usd,
      precio_base_usd = case
        when coalesce(v_cantidad_por_compra, 0) > 0
             and penultima_precio_usd is not null
          then penultima_precio_usd / v_cantidad_por_compra
        else penultima_precio_usd
      end,
      precio_actualizado = penultima_fecha,
      penultima_fecha = null,
      penultima_cantidad = null,
      penultima_precio_usd = null,
      penultima_precio_bs = null
    where id = old.insumo_id;
  else
    update public.insumos set
      stock_actual = greatest(0, coalesce(stock_actual, 0) - v_stock_sub)
    where id = old.insumo_id;
  end if;

  return old;
end;
$$;

drop trigger if exists compra_revert_from_insumo on public.compras;
create trigger compra_revert_from_insumo
  after delete on public.compras
  for each row execute function public.revertir_compra_de_insumo();
