-- Cocina · Fix completar_plan_produccion
-- "Completar" es un milestone de producción — NO toca el stock.
-- El ingrediente sigue comprometido hasta que se venda (Xetux) o se
-- borre/cancele el plan. Esto evita adelantarse a los hechos: completar la
-- producción no es lo mismo que vender el producto terminado.
--
-- NOTA (A5, dedupe): la definición canónica de delete_plan_produccion vive en
-- cocina-planes-venta-libera.sql (libera solo la FRACCIÓN no vendida). Antes
-- este archivo tenía otra versión de delete_plan que liberaba la cantidad
-- COMPLETA (bug A3); se eliminó de aquí para no pisar la buena.
--
-- Idempotente. CREATE OR REPLACE.

create or replace function public.completar_plan_produccion(p_plan_id uuid)
returns void
language plpgsql
security invoker
as $$
declare
  v_estado text;
begin
  select estado into v_estado
    from public.cocina_planes_produccion where id = p_plan_id;
  if v_estado is null then
    raise exception 'Plan no encontrado';
  end if;
  if v_estado <> 'pendiente' then
    raise exception 'Solo planes pendientes pueden completarse (actual: %)', v_estado;
  end if;

  -- Solo cambiar el estado. NO se toca el stock — el ingrediente sigue
  -- comprometido. La venta lo liberará y descontará del total.
  update public.cocina_planes_produccion
     set estado = 'completado', completado_at = now()
   where id = p_plan_id;
end;
$$;
