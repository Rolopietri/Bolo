-- Cocina · Compras: número de factura
-- ════════════════════════════════════════════════════════════════
-- Número de la factura del proveedor. Sirve para conciliar cada compra con su
-- factura (contabilidad), evitar pagar dos veces la misma y para el módulo
-- administrativo, que lee esta misma tabla `compras` (Análisis de Compras).
-- Texto libre porque las facturas pueden ser alfanuméricas. Opcional (no todas
-- las compras traen factura formal).
--
-- Aditivo e idempotente.

alter table public.compras
  add column if not exists numero_factura text;
