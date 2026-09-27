-- Cocina · Ítem del POS mapeado directo a un insumo (reventa)
-- ════════════════════════════════════════════════════════════════
-- Permite que un ítem del POS (una bebida, agua, refresco que se compra y se
-- revende tal cual) descuente stock SIN tener que crearle una receta 1:1.
-- Se clasifica como 'insumo_directo' y se vincula directamente a un insumo,
-- con una cantidad por unidad vendida (default 1).
--
-- Al vender: descuenta cantidad_por_unidad × unidades_vendidas del insumo.
-- Al borrar la venta: lo devuelve. Todo vía los triggers ya existentes, así
-- que queda registrado en la auditoría igual que cualquier movimiento.
--
-- Aditivo e idempotente.

-- 1) Catálogo de clasificación: insumo directo + cantidad por unidad
alter table public.pos_clasificacion
  add column if not exists insumo_id uuid references public.insumos(id) on delete set null,
  add column if not exists cantidad_por_unidad numeric(12, 4);

-- 2) Ventas: guardar el insumo directo y cuánto descontar por unidad
alter table public.ventas
  add column if not exists insumo_id uuid references public.insumos(id) on delete set null,
  add column if not exists insumo_cantidad numeric(12, 4);

create index if not exists idx_ventas_insumo on public.ventas(insumo_id);

-- 3) y 4) descontar/revertir_stock_por_venta  →  MOVIDAS (A5, dedupe)
-- Esta era una versión anterior (solo insumo directo + receta, sin extra ni
-- sustitución). La canónica y completa está en cocina-zzz-motor-canonico.sql.
-- Aquí se conservan solo las COLUMNAS (arriba), que sí son necesarias.
