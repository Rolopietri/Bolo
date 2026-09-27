-- Sub-recetas (preparaciones): salsas, mezclas, componentes que entran en otras recetas.
-- Ejemplo: "Salsa pesto" es subreceta usada en "Sandwich de pesto".

-- 1) Marcar recetas como subreceta + rendimiento
alter table public.recetas
  add column if not exists es_subreceta boolean not null default false,
  add column if not exists rendimiento numeric(12, 4),
  add column if not exists rendimiento_unidad text;

-- 2) Permitir que receta_ingredientes referencie una subreceta en vez de un insumo
alter table public.receta_ingredientes
  add column if not exists subreceta_id uuid references public.recetas(id) on delete set null;

create index if not exists idx_ri_subreceta on public.receta_ingredientes(subreceta_id);

-- 3) 4) 5) flatten_receta_insumos / descontar / revertir  →  MOVIDAS (A5, dedupe)
-- Estas eran las versiones ORIGINALES (sin conversión de unidades, sin factor de
-- porciones de subreceta, y descontar solo manejaba receta). Las canónicas y
-- completas están en cocina-zzz-motor-canonico.sql. Aquí quedan solo las
-- COLUMNAS de arriba (es_subreceta / rendimiento / subreceta_id), esenciales.
