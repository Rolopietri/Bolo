-- Cocina · Ingrediente libre "a propósito" en recetas
-- ════════════════════════════════════════════════════════════════
-- Algunas recetas llevan a propósito un ingrediente que NO está en el catálogo
-- de insumos (y por diseño no tiene stock ni costo): el caso típico es el agua
-- de filtro. Antes, cualquier ingrediente sin insumo mostraba el aviso amarillo
-- "No descuenta stock", lo cual era ruido en esos casos legítimos.
--
-- Esta columna marca que ESE ingrediente va sin insumo a propósito. Cuando está
-- en true:
--   • No sale el aviso amarillo (solo una nota gris discreta).
--   • El formulario SÍ deja guardar la receta (los no marcados la bloquean).
--
-- Solo aplica a líneas sin insumo_id ni subreceta_id (ingredientes libres). En
-- líneas vinculadas se ignora.
--
-- Aditivo e idempotente.

alter table public.receta_ingredientes
  add column if not exists sin_insumo_ok boolean not null default false;
