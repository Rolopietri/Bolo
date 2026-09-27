-- Cocina · Recalcular stock_comprometido desde compromisos de planes activos
-- Útil para fixear el estado si por algún motivo el comprometido se desincronizó
-- (RLS, caching, un fix a medias, lo que sea).
--
-- MODELO (confirmado con el motor real):
--   • Pendiente  → reserva la receta COMPLETA (aún no se produjo; se puede cancelar).
--   • Completado → ya se produjo; NO se puede cancelar. Sigue reservando lo que
--                  falta por vender/perder, y baja solo con ventas o mermas.
--   • Vendido    → ya se consumió del todo; no reserva nada.
--
-- Por eso la reserva viva de un plan = cantidad * (raciones - raciones_consumidas)
-- / raciones, contando planes 'pendiente' Y 'completado'. Esto reconstruye
-- EXACTAMENTE lo que mantiene el trigger liberar_comprometido_por_venta de forma
-- incremental (que también avanza raciones_consumidas por ventas y por mermas).
--
-- Idempotente — se puede correr cuantas veces sea necesario.
--
-- EFICIENCIA: solo ESCRIBE los insumos cuyo comprometido de verdad cambia. En
-- el caso normal (todo ya sincronizado) no toca ninguna fila. Así la llamada
-- automática al abrir el M5 deja de reescribir la base en cada visita.

create or replace function public.recalcular_stock_comprometido()
returns table (insumo_id uuid, stock_comprometido_anterior numeric, stock_comprometido_nuevo numeric)
language plpgsql
security invoker
as $$
begin
  return query
  with totales as (
    -- Reserva viva por insumo: solo lo que falta por vender/perder de cada plan
    -- pendiente o completado. Un plan completado sigue reservando hasta que su
    -- producto se venda o se registre como pérdida (sube raciones_consumidas).
    -- BLINDAJE: se convierte el compromiso (snapshot de unidad) a la unidad
    -- ACTUAL del insumo, para que aunque cambie la unidad base del insumo el
    -- total se calcule bien (ver cocina-fix-compromisos-unidad.sql).
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
       -- Solo escribir si la diferencia es REAL. La columna guarda 4 decimales;
       -- comparar decimal por decimal reescribía siempre los valores con
       -- decimales de división (ej. guardado 42.8571 vs calculado 42.857142…).
       -- Por eso comparamos por diferencia significativa, no exacta.
       and abs(coalesce(i.stock_comprometido, 0) - coalesce(t.total_comprometido, 0)) > 0.00005
    returning i.id, 0::numeric as anterior, i.stock_comprometido as nuevo
  ),
  resets as (
    -- Insumos sin ninguna reserva viva → 0.
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
