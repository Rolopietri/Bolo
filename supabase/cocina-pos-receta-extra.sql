-- Cocina · Receta EXTRA en un ítem del POS (combos "… con papas fritas")
-- ════════════════════════════════════════════════════════════════
-- Permite que un ítem del POS descuente su receta base MÁS una receta extra,
-- sin duplicar la receta base. Ej.: "Prosciutto pesto con papas fritas" se
-- vincula a la receta "Prosciutto pesto" (base) + extra "Ración de papas
-- fritas" (×1). Así el sándwich solo y el combo comparten la misma receta
-- base, y el combo agrega las papas.
--
-- Descuento total al vender N unidades:
--   receta base (N)  +  receta extra (N × extra_cantidad)
-- Reverso simétrico al borrar. Todo vía los triggers existentes.
--
-- Aditivo e idempotente.

alter table public.pos_clasificacion
  add column if not exists extra_receta_id uuid references public.recetas(id) on delete set null,
  add column if not exists extra_cantidad numeric(12, 4);

alter table public.ventas
  add column if not exists extra_receta_id uuid references public.recetas(id) on delete set null,
  add column if not exists extra_cantidad numeric(12, 4);

-- descontar/revertir_stock_por_venta  →  MOVIDAS (A5, dedupe)
-- Versión anterior (insumo + receta base + extra, sin sustitución). La canónica
-- y completa está en cocina-zzz-motor-canonico.sql. Aquí quedan solo las
-- COLUMNAS de arriba (extra_receta_id / extra_cantidad), que sí son necesarias.
