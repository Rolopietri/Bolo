-- Menaje · Ajuste ATÓMICO de cantidad_actual
-- ════════════════════════════════════════════════════════════════
-- Antes, descontar/sumar menaje se hacía leyendo cantidad_actual en el navegador,
-- calculando el nuevo valor y escribiéndolo (read-modify-write). Dos operaciones
-- casi simultáneas (ej. dos personas registrando) podían pisarse y perder una.
--
-- Este RPC hace el ajuste en un SOLO UPDATE en la base (cantidad = cantidad +
-- delta), así que es atómico: no hay ventana para que se pisen.
--   • delta negativo → descuento (pérdida, uso)
--   • delta positivo → compra (reposición)
-- Devuelve la nueva cantidad. greatest(0, …) evita negativos.
--
-- p_precio_reposicion (opcional): si el ítem no tenía precio de reposición y
-- esta compra trae uno, lo guarda (solo entonces). Idempotente.

create or replace function public.ajustar_menaje_stock(
  p_item_id uuid,
  p_delta numeric,
  p_precio_reposicion numeric default null
)
returns numeric
language plpgsql
security invoker
as $$
declare
  v_nueva numeric;
begin
  update public.menaje_items
     set cantidad_actual = greatest(0, coalesce(cantidad_actual, 0) + p_delta),
         precio_reposicion_usd = case
           when precio_reposicion_usd is null and p_precio_reposicion is not null
             then p_precio_reposicion
           else precio_reposicion_usd
         end
   where id = p_item_id
   returning cantidad_actual into v_nueva;

  if v_nueva is null then
    raise exception 'Ítem de menaje no encontrado';
  end if;
  return v_nueva;
end;
$$;
