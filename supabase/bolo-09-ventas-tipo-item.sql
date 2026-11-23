-- ═══════════════════════════════════════════════════════════════════
-- BOLO-09 · Columna ventas.tipo_item (falta en producción)
-- ═══════════════════════════════════════════════════════════════════
-- Causa del PGRST204 al guardar una venta: src/lib/data/ventas.ts
-- (createVenta y createVentasBatch) inserta tipo_item, pero ningún SQL
-- de supabase/ crea esa columna. Solo se menciona en el seed de demo.
-- PostgREST rechaza el insert: no encuentra tipo_item en el schema cache.
--
-- Definición tomada de src/lib/types.ts (TipoItem) y del default que ya
-- manda el código (input.tipoItem ?? "insumo"):
--   text NOT NULL DEFAULT 'insumo'
--   CHECK (insumo, insumo_directo, servicio, consignacion, sin_clasificar)
--
-- Idempotente. Correr en el SQL Editor de Supabase. El NOTIFY pide a
-- PostgREST que recargue el esquema.

alter table public.ventas
  add column if not exists tipo_item text;

update public.ventas
   set tipo_item = 'insumo'
 where tipo_item is null;

alter table public.ventas
  alter column tipo_item set default 'insumo';

alter table public.ventas
  alter column tipo_item set not null;

alter table public.ventas
  drop constraint if exists ventas_tipo_item_check;

alter table public.ventas
  add constraint ventas_tipo_item_check
  check (tipo_item in (
    'insumo',
    'insumo_directo',
    'servicio',
    'consignacion',
    'sin_clasificar'
  ));

comment on column public.ventas.tipo_item is
  'Tipo de ítem respecto al inventario: insumo (vía receta), insumo_directo (reventa), servicio, consignacion, sin_clasificar.';

notify pgrst, 'reload schema';
