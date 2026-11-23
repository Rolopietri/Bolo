-- ═══════════════════════════════════════════════════════════════════
-- BOLO-08 · Fase D: las ventas descuentan del PROCESADO, no del crudo
-- ═══════════════════════════════════════════════════════════════════
-- Para un insumo que se procesa (se_procesa = true), lo que se vende sale de
-- lo que ya está listo (stock_procesado), no de la materia prima (stock_actual).
-- Para los demás insumos, todo sigue igual (descuenta de stock_actual).
--
-- Solo cambia a qué "bolsillo" va cada UPDATE de stock en las dos funciones de
-- venta. El resto (recetas, swaps "sin X" / cambios, extras, motivo del libro)
-- queda idéntico. Los triggers no se tocan: se re-crean las funciones.
--
-- Este archivo ordena ANTES de cocina-zzz-motor-canonico.sql. La copia que
-- gana al reaplicar en orden alfabético es la de ese archivo (mismas dos
-- funciones, con se_procesa). Si se cambia la Fase D, hay que cambiarla ahí.
--
-- Nota de diseño: al procesado se le aplica greatest(0, …) igual que al crudo;
-- si vendes más de lo que procesaste, el procesado queda en 0 (no toca el crudo:
-- el crudo hay que procesarlo antes de poder venderlo).

-- ─── Al vender: descontar del bolsillo correcto ────────────────────────
create or replace function public.descontar_stock_por_venta()
 returns trigger
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
declare
  r record;
  v_qty numeric;
  v_target uuid;
begin
  perform set_config('bolo.motivo', case when coalesce(new.es_merma, false) then 'merma_receta' else 'venta' end, true);
  if new.insumo_id is not null then
    v_qty := coalesce(new.insumo_cantidad, 1) * new.cantidad;
    update public.insumos
       set stock_actual    = case when se_procesa then stock_actual else greatest(0, stock_actual - v_qty) end,
           stock_procesado = case when se_procesa then greatest(0, coalesce(stock_procesado, 0) - v_qty) else stock_procesado end
     where id = new.insumo_id;
    if new.swap_from_insumo_id is not null then
      update public.insumos
         set stock_actual    = case when se_procesa then stock_actual else stock_actual + v_qty end,
             stock_procesado = case when se_procesa then coalesce(stock_procesado, 0) + v_qty else stock_procesado end
       where id = new.swap_from_insumo_id;
    end if;
    return new;
  end if;

  if new.receta_id is not null then
    for r in (
      select insumo_id, sum(total_cantidad) as total
      from public.flatten_receta_insumos(new.receta_id, new.cantidad)
      group by insumo_id
    ) loop
      -- "Sin X": swap_from SIN swap_to → se quita ese insumo (no se descuenta).
      if new.swap_from_insumo_id is not null
         and r.insumo_id = new.swap_from_insumo_id
         and new.swap_to_insumo_id is null then
        continue;
      end if;
      v_target := case
        when new.swap_from_insumo_id is not null
         and r.insumo_id = new.swap_from_insumo_id
         and new.swap_to_insumo_id is not null
        then new.swap_to_insumo_id else r.insumo_id end;
      update public.insumos
      set stock_actual    = case when se_procesa then stock_actual else greatest(0, stock_actual - r.total) end,
          stock_procesado = case when se_procesa then greatest(0, coalesce(stock_procesado, 0) - r.total) else stock_procesado end
      where id = v_target;
    end loop;
  end if;

  if new.extra_receta_id is not null then
    for r in (
      select insumo_id, sum(total_cantidad) as total
      from public.flatten_receta_insumos(
        new.extra_receta_id, new.cantidad * coalesce(new.extra_cantidad, 1))
      group by insumo_id
    ) loop
      -- "Sin X": swap_from SIN swap_to → se quita ese insumo (no se descuenta).
      if new.swap_from_insumo_id is not null
         and r.insumo_id = new.swap_from_insumo_id
         and new.swap_to_insumo_id is null then
        continue;
      end if;
      v_target := case
        when new.swap_from_insumo_id is not null
         and r.insumo_id = new.swap_from_insumo_id
         and new.swap_to_insumo_id is not null
        then new.swap_to_insumo_id else r.insumo_id end;
      update public.insumos
      set stock_actual    = case when se_procesa then stock_actual else greatest(0, stock_actual - r.total) end,
          stock_procesado = case when se_procesa then greatest(0, coalesce(stock_procesado, 0) - r.total) else stock_procesado end
      where id = v_target;
    end loop;
  end if;

  return new;
end;
$function$;

-- ─── Al borrar la venta: reponer el mismo bolsillo ─────────────────────
create or replace function public.revertir_stock_por_venta()
 returns trigger
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
declare
  r record;
  v_qty numeric;
  v_target uuid;
begin
  perform set_config('bolo.motivo', 'venta_revertida', true);
  if old.insumo_id is not null then
    v_qty := coalesce(old.insumo_cantidad, 1) * old.cantidad;
    update public.insumos
       set stock_actual    = case when se_procesa then stock_actual else stock_actual + v_qty end,
           stock_procesado = case when se_procesa then coalesce(stock_procesado, 0) + v_qty else stock_procesado end
     where id = old.insumo_id;
    if old.swap_from_insumo_id is not null then
      update public.insumos
         set stock_actual    = case when se_procesa then stock_actual else greatest(0, stock_actual - v_qty) end,
             stock_procesado = case when se_procesa then greatest(0, coalesce(stock_procesado, 0) - v_qty) else stock_procesado end
       where id = old.swap_from_insumo_id;
    end if;
    return old;
  end if;

  if old.receta_id is not null then
    for r in (
      select insumo_id, sum(total_cantidad) as total
      from public.flatten_receta_insumos(old.receta_id, old.cantidad)
      group by insumo_id
    ) loop
      -- "Sin X": swap_from SIN swap_to → se quitó ese insumo (nunca se descontó,
      -- así que no se repone).
      if old.swap_from_insumo_id is not null
         and r.insumo_id = old.swap_from_insumo_id
         and old.swap_to_insumo_id is null then
        continue;
      end if;
      v_target := case
        when old.swap_from_insumo_id is not null
         and r.insumo_id = old.swap_from_insumo_id
         and old.swap_to_insumo_id is not null
        then old.swap_to_insumo_id else r.insumo_id end;
      update public.insumos
      set stock_actual    = case when se_procesa then stock_actual else stock_actual + r.total end,
          stock_procesado = case when se_procesa then coalesce(stock_procesado, 0) + r.total else stock_procesado end
      where id = v_target;
    end loop;
  end if;

  if old.extra_receta_id is not null then
    for r in (
      select insumo_id, sum(total_cantidad) as total
      from public.flatten_receta_insumos(
        old.extra_receta_id, old.cantidad * coalesce(old.extra_cantidad, 1))
      group by insumo_id
    ) loop
      -- "Sin X": swap_from SIN swap_to → se quitó ese insumo (nunca se descontó,
      -- así que no se repone).
      if old.swap_from_insumo_id is not null
         and r.insumo_id = old.swap_from_insumo_id
         and old.swap_to_insumo_id is null then
        continue;
      end if;
      v_target := case
        when old.swap_from_insumo_id is not null
         and r.insumo_id = old.swap_from_insumo_id
         and old.swap_to_insumo_id is not null
        then old.swap_to_insumo_id else r.insumo_id end;
      update public.insumos
      set stock_actual    = case when se_procesa then stock_actual else stock_actual + r.total end,
          stock_procesado = case when se_procesa then coalesce(stock_procesado, 0) + r.total else stock_procesado end
      where id = v_target;
    end loop;
  end if;

  return old;
end;
$function$;
