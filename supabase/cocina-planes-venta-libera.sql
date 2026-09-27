-- Cocina · M5 — La venta libera el stock comprometido (cierre del ciclo)
-- ════════════════════════════════════════════════════════════════
-- Conecta ventas (Xetux o manual) con los planes de producción:
-- al vender un producto, se libera automáticamente el stock comprometido
-- por los planes pendientes/completados de esa receta, en orden FIFO
-- (el plan más viejo primero).
--
-- Modelo de stock (recordatorio):
--   total        = físico (baja con pérdida y con venta vía trigger existente)
--   comprometido = reservado por planes activos
--   libre        = total - comprometido
--
-- Coherencia clave: 1 ración del plan == 1 unidad vendida (ambas escalan
-- igual contra `porciones`). Por eso, al vender una unidad que YA estaba
-- comprometida, el trigger existente baja el `total` y este trigger baja el
-- `comprometido` en la misma cantidad → el `libre` queda invariante (la bolsa
-- ya no era stock libre; venderla no cambia lo disponible para otra cosa).
--
-- Soporta ventas PARCIALES: un plan de 10 raciones del que se venden 3 queda
-- con raciones_consumidas=3 y libera 3/10 de su compromiso. Cuando se agota
-- (consumidas >= raciones) pasa a estado 'vendido'.
--
-- Aditivo, idempotente — corre seguro varias veces.

-- ────────────────────────────────────────────────────────────────
-- 1) Consumo parcial del plan por ventas
-- ────────────────────────────────────────────────────────────────
alter table public.cocina_planes_produccion
  add column if not exists raciones_consumidas numeric(10, 2) not null default 0;

-- ────────────────────────────────────────────────────────────────
-- 2) Trigger AFTER INSERT en ventas: liberar comprometido FIFO
-- ────────────────────────────────────────────────────────────────
-- No registra stock_movimientos por línea para no inundar el historial
-- (un import de Xetux son muchas líneas × varios ingredientes). La
-- trazabilidad queda en raciones_consumidas del plan.
create or replace function public.liberar_comprometido_por_venta()
returns trigger language plpgsql as $$
declare
  v_restante numeric;
  v_take numeric;
  v_frac numeric;
  v_plan record;
  v_comp record;
begin
  if new.receta_id is null then return new; end if;
  v_restante := new.cantidad;
  if v_restante is null or v_restante <= 0 then return new; end if;

  for v_plan in
    select id, raciones, coalesce(raciones_consumidas, 0) as consumidas, estado
      from public.cocina_planes_produccion
     where receta_id = new.receta_id
       and estado in ('pendiente', 'completado')
       and coalesce(raciones_consumidas, 0) < raciones
     order by created_at asc          -- FIFO: el plan más viejo se vende primero
     for update
  loop
    exit when v_restante <= 0;
    v_take := least(v_restante, v_plan.raciones - v_plan.consumidas);
    if v_take <= 0 then continue; end if;
    v_frac := v_take / v_plan.raciones;

    -- Liberar la fracción correspondiente de cada ingrediente comprometido.
    -- greatest(0, …) protege contra desajustes acumulados de redondeo.
    for v_comp in
      select insumo_id, cantidad
        from public.cocina_plan_compromisos where plan_id = v_plan.id
    loop
      update public.insumos
         set stock_comprometido =
               greatest(0, coalesce(stock_comprometido, 0) - v_comp.cantidad * v_frac)
       where id = v_comp.insumo_id;
    end loop;

    update public.cocina_planes_produccion
       set raciones_consumidas = v_plan.consumidas + v_take,
           estado = case
                      when v_plan.consumidas + v_take >= v_plan.raciones then 'vendido'
                      else estado
                    end,
           completado_at = case
                      when v_plan.consumidas + v_take >= v_plan.raciones
                        then coalesce(completado_at, now())
                      else completado_at
                    end
     where id = v_plan.id;

    v_restante := v_restante - v_take;
  end loop;

  return new;
end;
$$;

drop trigger if exists venta_libera_comprometido on public.ventas;
create trigger venta_libera_comprometido
  after insert on public.ventas
  for each row execute function public.liberar_comprometido_por_venta();

-- ────────────────────────────────────────────────────────────────
-- 3) Trigger AFTER DELETE en ventas: re-comprometer (deshacer venta)
-- ────────────────────────────────────────────────────────────────
-- Simétrico al de insert pero en orden inverso (LIFO): re-compromete los
-- planes que fueron consumidos más recientemente. Cubre el caso común de
-- "deshacer la última venta / re-importar un cierre".
create or replace function public.recommit_comprometido_por_venta()
returns trigger language plpgsql as $$
declare
  v_restante numeric;
  v_give numeric;
  v_frac numeric;
  v_plan record;
  v_comp record;
begin
  if old.receta_id is null then return old; end if;
  v_restante := old.cantidad;
  if v_restante is null or v_restante <= 0 then return old; end if;

  for v_plan in
    select id, raciones, coalesce(raciones_consumidas, 0) as consumidas, estado
      from public.cocina_planes_produccion
     where receta_id = old.receta_id
       and coalesce(raciones_consumidas, 0) > 0
       and estado in ('pendiente', 'completado', 'vendido')
     order by created_at desc
     for update
  loop
    exit when v_restante <= 0;
    v_give := least(v_restante, v_plan.consumidas);
    if v_give <= 0 then continue; end if;
    v_frac := v_give / v_plan.raciones;

    for v_comp in
      select insumo_id, cantidad
        from public.cocina_plan_compromisos where plan_id = v_plan.id
    loop
      update public.insumos
         set stock_comprometido = coalesce(stock_comprometido, 0) + v_comp.cantidad * v_frac
       where id = v_comp.insumo_id;
    end loop;

    update public.cocina_planes_produccion
       set raciones_consumidas = v_plan.consumidas - v_give,
           estado = case
                      when v_plan.estado = 'vendido'
                       and (v_plan.consumidas - v_give) < v_plan.raciones then 'completado'
                      else v_plan.estado
                    end
     where id = v_plan.id;

    v_restante := v_restante - v_give;
  end loop;

  return old;
end;
$$;

drop trigger if exists venta_recommit_comprometido on public.ventas;
create trigger venta_recommit_comprometido
  after delete on public.ventas
  for each row execute function public.recommit_comprometido_por_venta();

-- ────────────────────────────────────────────────────────────────
-- 4) cancelar_plan_produccion — liberar solo lo RESTANTE
-- ────────────────────────────────────────────────────────────────
-- Si el plan ya tenía ventas parciales, su compromiso vivo es solo la
-- fracción no vendida. Liberar el total restaría de más y afectaría a otros
-- planes que comparten el mismo insumo.
create or replace function public.cancelar_plan_produccion(p_plan_id uuid)
returns void
language plpgsql
security invoker
as $$
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
       'Plan cancelado: ' || v_nombre, current_date,
       'Plan ' || p_plan_id::text);
  end loop;

  update public.cocina_planes_produccion
     set estado = 'cancelado', cancelado_at = now()
   where id = p_plan_id;
end;
$$;

-- ────────────────────────────────────────────────────────────────
-- 5) delete_plan_produccion — liberar solo lo RESTANTE antes de borrar
-- ────────────────────────────────────────────────────────────────
create or replace function public.delete_plan_produccion(p_plan_id uuid)
returns void
language plpgsql
security invoker
as $$
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

  -- Un plan COMPLETADO no se puede borrar: el producto ya está hecho y sus
  -- insumos no vuelven a su estado original (aderezo, pesto, falafel…). Solo
  -- puede venderse o registrarse como pérdida. Borrarlo liberaría comprometido
  -- y dejaría el crudo "devuelto" como libre → inflaría el inventario.
  if v_estado = 'completado' then
    raise exception 'No se puede borrar un plan completado: solo se vende o se registra como pérdida.';
  end if;

  -- Liberar el compromiso vivo (fracción no vendida) al borrar un pendiente.
  -- 'vendido' y 'cancelado' ya no tienen compromiso, así que la fracción da 0.
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
           'Plan borrado: ' || v_nombre, current_date,
           'Plan ' || p_plan_id::text);
      end loop;
    end if;
  end if;

  delete from public.cocina_planes_produccion where id = p_plan_id;
end;
$$;

-- ────────────────────────────────────────────────────────────────
-- 6) recalcular_stock_comprometido  →  MOVIDA (A5, dedupe)
-- ────────────────────────────────────────────────────────────────
-- La definición canónica vive en cocina-recalcular-comprometido.sql. Esa
-- versión, además de contar la fracción no vendida de planes pendientes y
-- completados, SOLO escribe cuando el valor cambia de verdad (para no
-- reescribir la base en cada carga del M5). La versión que estaba aquí era
-- anterior a esa mejora; se eliminó para no pisarla al reaplicar.
