-- Cocina · Arreglo de compromisos de planes con unidad desfasada
--
-- PROBLEMA
-- Cuando se cambia la unidad base de un insumo (ej. ajo de g → kg), el sistema
-- convierte el stock del insumo pero NO los compromisos ya guardados en los
-- planes (cocina_plan_compromisos.cantidad, que trae un snapshot de la unidad).
-- Resultado: un compromiso de 14 g queda como "14" y, con el insumo ya en kg,
-- se lee como 14 kg → el stock libre se ve en 0 aunque el insumo tenga stock.
--
-- SOLUCIÓN (2 capas)
--   1) DATOS: convertir los compromisos desfasados a la unidad actual del insumo
--      usando la función canónica convertir_para_costo, y actualizar el snapshot.
--   2) BLINDAJE: recalcular_stock_comprometido ahora convierte al vuelo el
--      compromiso (snapshot → unidad actual del insumo), así aunque queden
--      snapshots viejos el total siempre se calcula en la unidad correcta.
--
-- Idempotente — se puede correr varias veces sin daño.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) DATOS · convertir SOLO los compromisos donde la conversión es matemática-
--    mente segura: mismo tipo de unidad (peso↔peso, volumen↔volumen), donde
--    convertir_para_costo realmente cambia el número (ej. g→kg ÷1000).
--    Se EXCLUYE a propósito:
--      • unidades iguales escritas distinto (unid/unidades) → el valor no cambia,
--        no hace falta tocarlas.
--      • conversiones entre dimensiones distintas (g→L) → dependen de densidad,
--        no se pueden convertir solas; se resuelven a mano.
update public.cocina_plan_compromisos c
set cantidad    = round(
                    public.convertir_para_costo(c.cantidad, c.unidad_base, i.unidad_base)::numeric,
                    4
                  ),
    unidad_base = i.unidad_base
from public.insumos i
where c.insumo_id = i.id
  and abs(
        public.convertir_para_costo(c.cantidad, c.unidad_base, i.unidad_base) - c.cantidad
      ) > 0.00005;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) BLINDAJE · recalcular_stock_comprometido convierte el compromiso al vuelo.
--    (Misma lógica que la versión previa, pero envolviendo c.cantidad en
--    convertir_para_costo contra la unidad_base ACTUAL del insumo.)
create or replace function public.recalcular_stock_comprometido()
returns table (insumo_id uuid, stock_comprometido_anterior numeric, stock_comprometido_nuevo numeric)
language plpgsql
security invoker
as $$
begin
  return query
  with totales as (
    select
      c.insumo_id,
      sum(
        public.convertir_para_costo(c.cantidad, c.unidad_base, i.unidad_base)
        * (p.raciones - coalesce(p.raciones_consumidas, 0))::numeric
        / nullif(p.raciones, 0)
      ) as total_comprometido
    from public.cocina_plan_compromisos c
    join public.cocina_planes_produccion p on p.id = c.plan_id
    join public.insumos i on i.id = c.insumo_id
    where p.estado in ('pendiente', 'completado')
      and coalesce(p.raciones_consumidas, 0) < p.raciones
    group by c.insumo_id
  ),
  updates as (
    update public.insumos i
       set stock_comprometido = coalesce(t.total_comprometido, 0)
      from totales t
     where i.id = t.insumo_id
       and abs(coalesce(i.stock_comprometido, 0) - coalesce(t.total_comprometido, 0)) > 0.00005
    returning i.id, 0::numeric as anterior, i.stock_comprometido as nuevo
  ),
  resets as (
    update public.insumos i
       set stock_comprometido = 0
     where not exists (
       select 1 from public.cocina_plan_compromisos c
         join public.cocina_planes_produccion p on p.id = c.plan_id
        where c.insumo_id = i.id
          and p.estado in ('pendiente', 'completado')
          and coalesce(p.raciones_consumidas, 0) < p.raciones
     )
       and coalesce(i.stock_comprometido, 0) <> 0
    returning i.id, 0::numeric as anterior, 0::numeric as nuevo
  )
  select * from updates
  union all
  select * from resets;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) COSMÉTICO · normalizar el snapshot cuando la unidad es la MISMA escrita
--    distinto (ej. "unid" vs "unidades"): el valor no cambia, solo la etiqueta.
--    Se restringe a la misma dimensión para NO tocar cruces peso↔volumen.
-- Normaliza cuando el valor NO cambia (misma unidad escrita distinto, ej.
-- unid/unidades), pero NUNCA cuando son dos unidades conocidas de dimensión
-- distinta (g vs L) — ese caso es un cruce real que se resuelve a mano.
update public.cocina_plan_compromisos c
set unidad_base = i.unidad_base
from public.insumos i
where c.insumo_id = i.id
  and public.unidad_norm(c.unidad_base) is distinct from public.unidad_norm(i.unidad_base)
  and abs(public.convertir_para_costo(c.cantidad, c.unidad_base, i.unidad_base) - c.cantidad) <= 0.00005
  and not (
    public.unidad_factor(c.unidad_base) is not null
    and public.unidad_factor(i.unidad_base) is not null
    and public.unidad_dim(c.unidad_base) is distinct from public.unidad_dim(i.unidad_base)
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) BLINDAJE A FUTURO · trigger: al cambiar la unidad_base de un insumo, si
--    tiene compromisos, se convierten automáticamente (misma dimensión) y se
--    recalcula su stock_comprometido en el acto. Vive en la base de datos, así
--    que aplica venga el cambio de la app o del editor SQL.
create or replace function public.sync_compromisos_al_cambiar_unidad()
returns trigger language plpgsql as $$
begin
  -- Solo actuar si de verdad cambió la unidad base.
  if public.unidad_norm(new.unidad_base) is distinct from public.unidad_norm(old.unidad_base) then

    -- (a) Convertir los compromisos de este insumo a la nueva unidad, solo cuando
    --     es una conversión real del mismo tipo (peso↔peso, volumen↔volumen).
    --     Los cruces de dimensión (g→L) NO se tocan: dependen de densidad y hay
    --     que resolverlos a mano.
    update public.cocina_plan_compromisos c
    set cantidad    = round(public.convertir_para_costo(c.cantidad, c.unidad_base, new.unidad_base)::numeric, 4),
        unidad_base = new.unidad_base
    where c.insumo_id = new.id
      and abs(public.convertir_para_costo(c.cantidad, c.unidad_base, new.unidad_base) - c.cantidad) > 0.00005;

    -- (b) Recalcular el stock_comprometido de ESTE insumo desde sus compromisos
    --     vivos (planes pendiente/completado con raciones por consumir).
    new.stock_comprometido := coalesce((
      select sum(
        public.convertir_para_costo(c.cantidad, c.unidad_base, new.unidad_base)
        * (p.raciones - coalesce(p.raciones_consumidas, 0))::numeric
        / nullif(p.raciones, 0)
      )
      from public.cocina_plan_compromisos c
      join public.cocina_planes_produccion p on p.id = c.plan_id
      where c.insumo_id = new.id
        and p.estado in ('pendiente', 'completado')
        and coalesce(p.raciones_consumidas, 0) < p.raciones
    ), 0);
  end if;
  return new;
end;
$$;

drop trigger if exists insumos_sync_compromisos_unidad on public.insumos;
create trigger insumos_sync_compromisos_unidad
  before update on public.insumos
  for each row execute function public.sync_compromisos_al_cambiar_unidad();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) Recalcular ya, para que el stock_comprometido de cada insumo quede al día.
select * from public.recalcular_stock_comprometido();
