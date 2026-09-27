-- Al BORRAR una compra, revertir su efecto en el insumo.
--
-- CONTEXTO
-- Al insertar una compra, el trigger `apply_compra_to_insumo` suma stock y
-- actualiza el precio del insumo (rotando el historial de 2 niveles:
-- ultima ↔ penultima). Antes, al borrar una compra no pasaba nada, y había que
-- corregir el stock a mano en el módulo de stock.
--
-- Este trigger, al borrar una compra:
--   • STOCK: siempre resta lo que la compra había sumado (cantidad ×
--     cantidad_por_compra). Es la parte crítica y siempre es exacta.
--   • PRECIO: solo si la compra borrada era la ÚLTIMA registrada del insumo
--     (heurística por fecha + cantidad), revierte el precio rotando desde la
--     penúltima compra. Si se borra una compra vieja (no la última), el precio
--     NO se toca (el historial de 2 niveles no permite reconstruirlo bien);
--     solo se revierte el stock.
--
-- Cómo aplicarlo: pégalo en Supabase → SQL Editor y córrelo una vez.

create or replace function public.revertir_compra_de_insumo()
returns trigger language plpgsql as $$
declare
  v_cantidad_por_compra numeric;
  v_stock_sub numeric;
  v_es_ultima boolean;
begin
  select cantidad_por_compra into v_cantidad_por_compra
  from public.insumos where id = old.insumo_id;

  v_stock_sub := old.cantidad * coalesce(v_cantidad_por_compra, 1);

  -- ¿La compra borrada es la última registrada del insumo?
  select (old.fecha = ultima_fecha and old.cantidad = ultima_cantidad)
    into v_es_ultima
  from public.insumos where id = old.insumo_id;

  if coalesce(v_es_ultima, false) then
    -- Revertir stock + precio (rotando desde la penúltima).
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
    -- Solo revertir stock (no se toca el precio).
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
