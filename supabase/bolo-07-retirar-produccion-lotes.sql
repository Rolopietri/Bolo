-- ═══════════════════════════════════════════════════════════════════
-- BOLO-07 · Retirar la tabla produccion_lotes
-- ═══════════════════════════════════════════════════════════════════
-- Desde BOLO-06, Producción y "Procesar" viven en `procesamientos`. La tabla
-- `produccion_lotes` quedó sin uso (ningún código la lee ni la escribe).
-- Autorizado por el responsable. No afecta `procesamientos`.

drop table if exists public.produccion_lotes;
