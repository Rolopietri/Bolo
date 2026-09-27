-- Cocina · porciones ≥ 1 en recetas
-- ════════════════════════════════════════════════════════════════
-- Si una receta se guarda con porciones = 0, el motor diverge: un plan de
-- producción SÍ compromete crudo (el TS asume porciones=1), pero la venta de esa
-- receta NO descuenta nada (flatten_receta_insumos retorna vacío cuando
-- porciones = 0) y libera el comprometido igual → inventario inflado.
--
-- El formulario ya coacciona porciones a ≥ 1 y la capa de datos ahora también,
-- pero un CHECK lo blinda por cualquier vía (SQL directo, otra integración).
--
-- Idempotente.

-- 1) Arreglar cualquier fila existente con porciones inválido.
update public.recetas
   set porciones = 1
 where porciones is null or porciones < 1;

-- 2) Blindaje: porciones siempre ≥ 1.
alter table public.recetas
  drop constraint if exists recetas_porciones_pos;
alter table public.recetas
  add constraint recetas_porciones_pos check (porciones >= 1);
