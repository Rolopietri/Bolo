-- Corrección de totales de ventas importadas de Xetux.
--
-- CONTEXTO / LECCIÓN APRENDIDA
-- Los exports de Xetux NO son uniformes: unos traen la columna de dinero como
-- TOTAL de línea (venta neta) y otros como PRECIO UNITARIO. El importador viejo
-- asumía siempre precio unitario y multiplicaba por la cantidad → inflaba los
-- que en realidad ya eran totales. Al corregir, NO se puede asumir que TODOS
-- estaban inflados: hay que mirar import por import (batch_id) y comparar la
-- suma contra el TOTAL GENERAL del reporte.
--
-- El importador ya se blindó (el usuario elige "total de línea" vs "precio
-- unitario" con vista previa), así que esto no debería repetirse.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 0 · Diagnóstico: suma por import vs TOTAL GENERAL del PDF.
select fecha, batch_id, count(*) as items,
       round(sum(total_usd)::numeric, 2) as suma_total
from ventas
where fuente = 'xetux_csv'
group by fecha, batch_id
order by fecha;

-- ─────────────────────────────────────────────────────────────────────────────
-- CASO A · Import cuya columna era TOTAL de línea y quedó inflado (total =
-- cantidad × venta_neta). Deja total = venta neta y precio = venta neta ÷ cant.
-- Idempotente por el marcador en notas. Reemplaza <BATCH_INFLADO> por el batch.
--
-- update ventas
-- set total_usd           = precio_unitario_usd,
--     precio_unitario_usd = round((precio_unitario_usd / cantidad)::numeric, 4),
--     notas               = trim(coalesce(notas, '') || ' [total corregido]')
-- where batch_id = '<BATCH_INFLADO>'
--   and cantidad > 1
--   and precio_unitario_usd is not null
--   and coalesce(notas, '') not like '%[total corregido]%';

-- ─────────────────────────────────────────────────────────────────────────────
-- CASO B · Import que YA estaba bien (columna era precio unitario) pero se le
-- aplicó el CASO A de más → quedó dividido. Restaura multiplicando de vuelta.
-- Reemplaza <BATCH_BIEN> por el batch afectado.
--
-- update ventas
-- set total_usd           = round((total_usd * cantidad)::numeric, 4),
--     precio_unitario_usd = total_usd,   -- (usa el total_usd viejo = precio unit.)
--     notas               = trim(replace(notas, '[total corregido]', '[restaurado]'))
-- where batch_id = '<BATCH_BIEN>'
--   and cantidad > 1
--   and coalesce(notas, '') like '%[total corregido]%';

-- Verificación final: cada batch debe cuadrar con el TOTAL GENERAL de su PDF.
-- select batch_id, round(sum(total_usd)::numeric, 2)
-- from ventas where fuente = 'xetux_csv' group by batch_id;
