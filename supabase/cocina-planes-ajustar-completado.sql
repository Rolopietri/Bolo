-- Cocina · Ajustar un plan de producción COMPLETADO
-- ════════════════════════════════════════════════════════════════
-- Permite corregir un plan ya completado cuando cambia el rendimiento de la
-- receta (ej. bajas el tamaño de porción → el mismo lote rinde más) o cuando
-- hay que emparejar cuántas porciones ya se consumieron.
--
-- Ajusta las 3 capas para que quede real, no cosmético:
--   • raciones y raciones_consumidas del plan.
--   • stock físico: la fracción consumida pasa de C/R (vieja, ya descontada por
--     ventas) a C'/R' (nueva) → se descuenta/devuelve la diferencia por insumo.
--   • stock comprometido: se recalcula (queda reservado (R'-C')/R' del lote).
--
-- El compromiso por insumo (cantidad de crudo del lote) NO cambia: el lote
-- físico es el mismo, solo cambia en cuántas porciones se divide.
--
-- Idempotente en el sentido de que puedes correrlo varias veces con distintos
-- valores; cada llamada ajusta desde el estado actual.

create or replace function public.ajustar_plan_completado(
  p_plan_id uuid,
  p_raciones numeric,
  p_raciones_consumidas numeric
) returns void
language plpgsql
security invoker
as $$
declare
  v_estado   text;
  v_r_old    numeric;
  v_c_old    numeric;
  v_delta    numeric;
  v_comp     record;
  v_estado_nuevo text;
begin
  select estado, raciones, coalesce(raciones_consumidas, 0)
    into v_estado, v_r_old, v_c_old
    from public.cocina_planes_produccion
   where id = p_plan_id;

  if v_estado is null then
    raise exception 'Plan no encontrado';
  end if;
  if v_estado not in ('completado', 'vendido') then
    raise exception 'Solo se ajustan planes completados (actual: %)', v_estado;
  end if;
  if p_raciones is null or p_raciones <= 0 then
    raise exception 'Las raciones deben ser mayores a 0.';
  end if;
  if p_raciones_consumidas is null
     or p_raciones_consumidas < 0
     or p_raciones_consumidas > p_raciones then
    raise exception 'Las consumidas deben estar entre 0 y las raciones.';
  end if;

  -- Diferencia de fracción consumida: lo ya servido pasa de C/R a C'/R'.
  v_delta := (p_raciones_consumidas / p_raciones)
             - (v_c_old / nullif(v_r_old, 0));

  if v_delta is not null and v_delta <> 0 then
    for v_comp in
      select insumo_id, cantidad
        from public.cocina_plan_compromisos
       where plan_id = p_plan_id
    loop
      update public.insumos
         set stock_actual = greatest(0, stock_actual - v_comp.cantidad * v_delta)
       where id = v_comp.insumo_id;
    end loop;
  end if;

  v_estado_nuevo := case
                      when p_raciones_consumidas >= p_raciones then 'vendido'
                      else 'completado'
                    end;

  update public.cocina_planes_produccion
     set raciones            = p_raciones,
         raciones_consumidas = p_raciones_consumidas,
         estado              = v_estado_nuevo
   where id = p_plan_id;

  -- Recalcular el comprometido de todos los insumos afectados.
  perform * from public.recalcular_stock_comprometido();
end;
$$;
