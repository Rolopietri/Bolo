-- Cocina · Sustitución de insumo en un ítem del POS
-- ════════════════════════════════════════════════════════════════
-- Permite que un ítem del POS use la MISMA receta base pero cambiando un
-- insumo por otro, en la misma cantidad. Ej.: "Latte leche de almendras"
-- usa la receta "Latte" pero descuenta leche de almendras en vez de leche
-- entera (por la cantidad que la receta ya especifica para la entera).
--
-- Sin duplicar recetas. Se aplica tanto a la receta base como a la extra.
-- Reverso simétrico al borrar. Aditivo e idempotente.

alter table public.pos_clasificacion
  add column if not exists swap_from_insumo_id uuid references public.insumos(id) on delete set null,
  add column if not exists swap_to_insumo_id uuid references public.insumos(id) on delete set null;

alter table public.ventas
  add column if not exists swap_from_insumo_id uuid references public.insumos(id) on delete set null,
  add column if not exists swap_to_insumo_id uuid references public.insumos(id) on delete set null;

-- descontar/revertir_stock_por_venta  →  MOVIDAS (A5, dedupe)
-- Versión anterior (tenía la sustitución pero le faltaba el swap-reverse en el
-- bloque de insumo directo). La canónica y completa está en
-- cocina-zzz-motor-canonico.sql. Aquí quedan solo las COLUMNAS de arriba
-- (swap_from_insumo_id / swap_to_insumo_id), que sí son necesarias.

-- ─── DECISIÓN DE MODELO (M8): swap vs. reservas de planes ─────────
-- El DESCUENTO de stock aplica la sustitución (resta el insumo swap_to). La
-- LIBERACIÓN de comprometido (liberar_comprometido_por_venta) NO conoce swaps:
-- libera la reserva del insumo ORIGINAL de la receta. Esto es INTENCIONAL y
-- correcto:
--   • El insumo original (ej. leche entera) que el plan reservó NO se usó en
--     esa venta (se sustituyó), así que liberar su reserva es lo correcto —
--     vuelve al stock libre.
--   • El insumo sustituto (ej. leche de almendras) sí se usó, y el descuento lo
--     resta del stock físico.
-- Propagar el swap a la liberación sería PEOR: dejaría al insumo original
-- reservado para siempre (los planes se arman desde la receta base, que no
-- tiene swaps). Por eso NO se propaga. Documentado a raíz de la auditoría (M8).
