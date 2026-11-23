# Migraciones / funciones SQL de cocina — cómo está organizado

## El problema (histórico)
Este directorio son archivos `.sql` sueltos que se aplicaron a mano, sin un
orden de migración numerado. Con el tiempo, **varias funciones quedaron
definidas en más de un archivo**, con versiones distintas. Como al reaplicar se
ejecutan en orden alfabético, la versión que "gana" es la del archivo que ordena
**último** — y en algunos casos esa era una versión **vieja** que degradaba una
corrección.

## La solución (A5, hecho)
La **base de producción es la fuente de verdad** (sus funciones se verificaron
con `pg_get_functiondef`). Se consolidó así:

### Motor de stock (descontar / revertir / flatten×2 / liberar / recommit)
- La versión canónica y correcta vive en **`cocina-zzz-motor-canonico.sql`**.
  El prefijo `zzz-` hace que se aplique **de último** → siempre gana.
- `descontar`/`revertir` y `liberar`/`recommit` **también** aparecen (versión
  vieja) en el archivo que trae su **trigger** (`cocina-ventas.sql` y
  `cocina-planes-venta-libera.sql`). Eso es **a propósito**: un `CREATE TRIGGER`
  exige que la función exista al crearse, así que la función va junto a su
  trigger. Luego `zzz` la sobreescribe con la versión correcta. **No borrar esas
  copias** — son carga estructural.
- `flatten_receta_insumos` / `flatten_receta_planes`: solo en `zzz` (no tienen
  trigger; se llaman en tiempo de ejecución).

### Otras funciones (una sola definición cada una)
- Unidades (`unidad_norm/dim/factor`, `convertir_para_costo`) →
  `cocina-fix-conversion-descuento-stock.sql`
- `recalcular_stock_comprometido` → canónica en
  `cocina-recalcular-comprometido.sql` (escribe-solo-si-cambia). Nota: también se
  (re)define en `cocina-fix-compromisos-unidad.sql` (paso "blindaje"); como ese
  archivo va antes por orden alfabético, la canónica lo sobreescribe y gana. Si
  la cambias, hazlo en la canónica.
- Planes: `create_plan_produccion` → `cocina-planes-produccion.sql`;
  `completar_plan_produccion` → `cocina-planes-fix-completar.sql`;
  `cancelar_plan_produccion` / `delete_plan_produccion` →
  `cocina-planes-venta-libera.sql`

## Regla de oro
- Al reaplicar el repo, hazlo en orden alfabético; `cocina-zzz-…` va de último.
- Si necesitas cambiar una función del **motor**, cámbiala en
  `cocina-zzz-motor-canonico.sql` (es la que gana).
- `descontar_stock_por_venta` y `revertir_stock_por_venta` incluyen la Fase D
  (`se_procesa` → descuenta o repone `stock_procesado`). `bolo-08-…` tiene la
  misma lógica pero ordena antes; no dejes la Fase D solo ahí, porque `zzz` la
  pisaría. Un archivo `bolo-09b-*.sql` tampoco gana: la `b` va antes que la `c`.
- `apply_compra_to_insumo` y `revertir_compra_de_insumo`: la versión vigente
  es **`cocina-recupera-iva-compras.sql`**. Ordena después de
  `cocina-precio-frescura.sql` (el apply anterior) y de
  `cocina-compra-zzzz-revertir-precio-anterior.sql` (el revertir anterior),
  así que al reaplicar en orden alfabético es la que gana. El precio del
  insumo sale de `costo_usd` si la compra lo trae; si no, de
  `precio_total_usd`. Antes de correrlo en una base que ya tiene esas
  funciones, compara con:

  ```sql
  select p.proname, pg_get_functiondef(p.oid)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('apply_compra_to_insumo', 'revertir_compra_de_insumo');
  ```
- Las columnas (`alter table … add column`) de los archivos `cocina-pos-*` y
  `cocina-subrecetas.sql` **sí son necesarias** — solo se quitaron de ahí las
  funciones duplicadas viejas, no las columnas.

## Estado
Duplicación peligrosa: **ninguna**. Las únicas funciones en 2 archivos son las 4
del motor con trigger (bundle + canónico), que es el patrón correcto. Migrar a
una carpeta `migrations/` numerada queda como higiene futura, sin urgencia.

## Datos demo (opt-in)
`supabase/demo/cocina-demo-seed.sql` **no** forma parte del orden alfabético.
Es un ejemplo para el proyecto de ensayo bolodemo. No lo pegues en una base
con operación real. Cómo correrlo: ver el encabezado de ese archivo y el README.
