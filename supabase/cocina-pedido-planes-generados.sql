-- Al marcar un pedido guardado como "comprado", la app crea automáticamente un
-- plan de producción PENDIENTE por cada receta del pedido (reserva sus insumos).
-- Esta columna marca que ya se generaron, para no duplicarlos si se cambia el
-- estado ida y vuelta (comprado → reabrir → comprado).
alter table public.cocina_pedidos
  add column if not exists planes_generados boolean not null default false;
