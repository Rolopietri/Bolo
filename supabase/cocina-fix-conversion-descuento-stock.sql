-- Cocina · FIX — conversión de unidades al descontar stock por venta/merma
-- ════════════════════════════════════════════════════════════════
-- BUG: la función recursiva flatten_receta_insumos (usada por el trigger que
-- descuenta stock en cada venta/merma) restaba la cantidad del ingrediente TAL
-- CUAL, sin convertir su unidad a la unidad base del insumo. Si una receta
-- declara el aceite en "ml" pero el insumo está en "L", restaba (p.ej.) 30 L
-- en vez de 30 ml → vaciaba el stock (y greatest(0, …) lo dejaba en 0).
--
-- El resto de la app (pedido sugerido, planes de producción) ya convertía
-- unidades (ver src/lib/units.ts). Este fix lleva la MISMA conversión a la
-- base de datos, para que el descuento cuadre.
--
-- Reglas (idénticas a units.ts):
--   • peso  → base g   (kg=1000, g=1, mg=0.001)
--   • vol   → base ml  (L=1000, ml=1, cc=1)
--   • conteo→ base unidad
--   • unidades desconocidas o iguales → se restan tal cual (sin conversión).
--
-- Aditivo e idempotente. NO cambia datos ya guardados; solo corrige el cálculo
-- de aquí en adelante.

-- ─── Helpers de unidades ─────────────────────────────────────────

-- Normaliza: minúsculas, sin espacios extra, sin acentos.
create or replace function public.unidad_norm(u text)
returns text language sql immutable as $$
  select lower(btrim(translate(coalesce(u, ''),
    'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')));
$$;

-- Dimensión de la unidad (peso | volumen | conteo | desconocida).
create or replace function public.unidad_dim(u text)
returns text language sql immutable as $$
  select case public.unidad_norm(u)
    when 'g' then 'peso' when 'gr' then 'peso' when 'grs' then 'peso'
    when 'gramo' then 'peso' when 'gramos' then 'peso'
    when 'kg' then 'peso' when 'kgs' then 'peso' when 'kilo' then 'peso'
    when 'kilos' then 'peso' when 'kilogramo' then 'peso' when 'kilogramos' then 'peso'
    when 'mg' then 'peso' when 'miligramo' then 'peso' when 'miligramos' then 'peso'
    when 'ml' then 'volumen' when 'mililitro' then 'volumen' when 'mililitros' then 'volumen'
    when 'cc' then 'volumen'
    when 'l' then 'volumen' when 'lt' then 'volumen' when 'lts' then 'volumen'
    when 'litro' then 'volumen' when 'litros' then 'volumen'
    when 'unidad' then 'conteo' when 'unidades' then 'conteo' when 'u' then 'conteo'
    when 'und' then 'conteo' when 'pza' then 'conteo' when 'pzas' then 'conteo'
    when 'pieza' then 'conteo' when 'piezas' then 'conteo'
    when 'porcion' then 'conteo' when 'porciones' then 'conteo'
    else 'desconocida'
  end;
$$;

-- Factor hacia la unidad base de su dimensión (g o ml). null = desconocida.
create or replace function public.unidad_factor(u text)
returns numeric language sql immutable as $$
  select case public.unidad_norm(u)
    when 'g' then 1 when 'gr' then 1 when 'grs' then 1
    when 'gramo' then 1 when 'gramos' then 1
    when 'kg' then 1000 when 'kgs' then 1000 when 'kilo' then 1000
    when 'kilos' then 1000 when 'kilogramo' then 1000 when 'kilogramos' then 1000
    when 'mg' then 0.001 when 'miligramo' then 0.001 when 'miligramos' then 0.001
    when 'ml' then 1 when 'mililitro' then 1 when 'mililitros' then 1 when 'cc' then 1
    when 'l' then 1000 when 'lt' then 1000 when 'lts' then 1000
    when 'litro' then 1000 when 'litros' then 1000
    when 'unidad' then 1 when 'unidades' then 1 when 'u' then 1 when 'und' then 1
    when 'pza' then 1 when 'pzas' then 1 when 'pieza' then 1 when 'piezas' then 1
    when 'porcion' then 1 when 'porciones' then 1
    else null
  end;
$$;

-- Convierte `cantidad` de u_from a u_to. Si son la misma unidad literal, o si
-- alguna es desconocida, o si son de dimensiones distintas → devuelve la
-- cantidad sin tocar (mismo fallback que convertirParaCosto en units.ts).
create or replace function public.convertir_para_costo(
  cantidad numeric, u_from text, u_to text
)
returns numeric language sql immutable as $$
  select case
    when public.unidad_norm(u_from) = public.unidad_norm(u_to) then cantidad
    when public.unidad_factor(u_from) is not null
     and public.unidad_factor(u_to) is not null
     and public.unidad_dim(u_from) = public.unidad_dim(u_to)
      then cantidad * public.unidad_factor(u_from) / public.unidad_factor(u_to)
    else cantidad
  end;
$$;

-- ─── flatten_receta_insumos  →  MOVIDA (A5, dedupe) ───────────────
-- Esta era una versión anterior (con conversión pero SIN el factor de
-- porciones de subreceta). La canónica está en cocina-zzz-motor-canonico.sql.
-- Las funciones de unidades de ARRIBA (unidad_norm/dim/factor/convertir_para_costo)
-- sí son canónicas y se quedan aquí (no están duplicadas).
