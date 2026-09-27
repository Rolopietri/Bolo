-- Agrega columna para precio manual en ingredientes ad-hoc (fuera del catálogo).
-- Si la línea de receta tiene insumo_id, el precio se calcula del catálogo.
-- Si NO tiene insumo_id, se usa este costo_manual_usd como base.
-- Es por unidad de la 'unidad' del ingrediente (ej: $0.05/g, $0.20/ml).

alter table public.receta_ingredientes
  add column if not exists costo_manual_usd numeric(12, 6);
