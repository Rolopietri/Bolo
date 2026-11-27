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
- `apply_compra_to_insumo`: la versión vigente es **`cocina-recupera-iva-compras.sql`**.
  Ordena después de `cocina-precio-frescura.sql`. El precio del insumo sale
  de `costo_usd` si la compra lo trae; si no, de `precio_total_usd`.
- `revertir_compra_de_insumo`, `reemplazar_compra` y `vincular_proveedor_insumo`:
  la versión vigente es **`cocina-recupera-iva-stock.sql`**. Ordena después de
  `cocina-recupera-iva-editar.sql`. Si editar o borrar dejaría el stock
  negativo, cancela la operación (no usa `greatest(0, …)`). La última compra
  del proveedor se recalcula al mover la fecha o al borrar.
- `cocina-recupera-iva-editar.sql` sigue siendo el paso anterior (delta de stock,
  bloqueo `for update`, revoke a `public`/`anon`). `cocina-recupera-iva-stock.sql`
  lo vuelve a escribir con el rechazo si quedaría negativo. Antes de pegar el
  archivo nuevo, compara:

  ```sql
  select p.proname, pg_get_functiondef(p.oid)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'apply_compra_to_insumo',
      'revertir_compra_de_insumo',
      'reemplazar_compra',
      'vincular_proveedor_insumo',
      'bolo_rechazar_stock_negativo'
    );

  select tgname, pg_get_triggerdef(t.oid)
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'compras'
    and tgname = 'compra_vincula_proveedor'
    and not t.tgisinternal;
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


### Jornada de cocina (cierre de caja)
- Tablas y funciones nuevas en **`cocina-jornada-cierre.sql`**. No pisa el motor ni las `_prod_*`.
- El cierre de jornada se engancha con un disparador `AFTER INSERT` en `cierre_caja` (hoy `guardarCierre` inserta la primera vez y luego actualiza).
- Horario del local, alerta y cierre automático: **`cocina-jornada-horario.sql`** (aditivo, después del anterior). Agrega `hora_apertura_habitual`, `hora_cierre_maxima` y `jornada_horario_nota` en `negocio_config`; la fecha de negocio en `cocina_jornadas`; `jornada_actual()`, `jornada_de(ts)` y `jornada_fecha(ts default now())`. Si se pasa la hora máxima y no hay cierre de caja, se cierra la jornada con origen `automatico`. Media hora antes avisa (posponer 1 hora, tope de 6, registradas). El respaldo fijo de las 6:00 queda reemplazado. Las demás áreas (compras, ventas, administración) todavía no usan `jornada_fecha`: eso va en otro cambio.
- Antes de aplicar, compara en vivo:

  ```sql
  select p.proname, pg_get_functiondef(p.oid)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      '_cocina_jornada_cerrar',
      '_cocina_jornada_respaldo',
      '_cocina_jornada_automatico',
      'cocina_tablero_en_uso',
      'jornada_actual',
      'jornada_de',
      'jornada_fecha',
      'trg_cierre_caja_jornada'
    );
  ```

- Pruebas locales (no correr en producción): `bash scripts/probar-jornada-cierre.sh`
- Fecha y tasa de la jornada en toda la app: **`cocina-jornada-sincro.sql`** (aditivo, después del de horario). `_prod_hoy()` y `negocio_hoy()` delegan en `jornada_fecha()`. Los defaults de fecha de negocio pasan a `jornada_fecha()`. Cada jornada guarda `tasa_tipo`, `tasa_valor` y `tasa_fecha` (no cambia a mitad de jornada). La factura de compra tiene `fecha_documento`. El resumen de Telegram se manda al cerrar la jornada; el cron de las 11:00 p. m. queda como repesca.
- Pruebas locales (no correr en producción): `bash scripts/probar-jornada-cierre.sh` (incluye cierre, horario y sincro).
- pg_cron no está instalado hoy; en el archivo de horario hay un ejemplo cada 15 minutos, sin activarlo. No aplicar estos SQL en producción sin la aprobación de Lucia.
