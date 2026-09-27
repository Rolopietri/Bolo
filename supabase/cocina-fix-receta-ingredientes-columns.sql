-- Cocina · Fix columnas faltantes en receta_ingredientes
-- El código asume `costo_manual_usd` (precio ad-hoc) y `subreceta_id` (referencia
-- a una subreceta como ingrediente). Si faltan, el insert de ingredientes falla
-- y la receta se guarda sin ingredientes.
--
-- Idempotente — corre seguro.

alter table public.receta_ingredientes
  add column if not exists costo_manual_usd numeric(12, 6);

alter table public.receta_ingredientes
  add column if not exists subreceta_id uuid references public.recetas(id) on delete set null;

create index if not exists idx_ri_subreceta on public.receta_ingredientes(subreceta_id);

-- Asegurar también las columnas de subreceta en la tabla recetas
alter table public.recetas
  add column if not exists es_subreceta boolean not null default false,
  add column if not exists rendimiento numeric(12, 4),
  add column if not exists rendimiento_unidad text;
