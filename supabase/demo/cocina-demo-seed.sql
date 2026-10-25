-- Cocina demo — dataset chico para un pitch en el proyecto bolodemo.
-- Fuente: src/lib/demo/cocina-demo.json
-- Generado con: node scripts/seed-cocina-demo.mjs --sql
--
-- NO es una migración. No entra en el orden alfabético de supabase/*.sql
-- (vive en supabase/demo/). No lo corras en una base con datos reales.
-- Antes tiene que estar el esquema de cocina, con cocina-zzz-motor-canonico.sql
-- ya aplicado: las compras y las ventas mueven el stock por trigger.
--
-- Idempotente: se puede pegar más de una vez. Solo inserta filas cuya
-- nota es exactamente «Datos de ejemplo (demo de bolo)» y que todavía no existen.
-- No borra nada. Reconoce las filas por esa nota.
--
-- Después de cargarlo, con las compras y ventas de ejemplo:
-- Agotados: Pimentón. Bajos: Harina de maíz precocida, Queso blanco, Cebolla, Parchita, Aguacate. En orden: Pollo pechuga, Aceite vegetal, Sal, Azúcar. Pedido de ejemplo (40 arepa con queso, 20 pollo a la plancha, 24 jugo de parchita, 12 ensalada de aguacate) pide: Aguacate, Cebolla, Harina de maíz precocida, Parchita, Pimentón, Pollo pechuga, Queso blanco.
-- Las compras disparan el trigger de stock y las ventas lo descuentan.
-- El pimentón no tiene compra a propósito: queda agotado para las alertas.
-- Las ventas llevan tipo_item = 'insumo' (columna que ya usa la app).

-- Proveedores
insert into public.proveedores (
  nombre, contacto_nombre, contacto_telefono, contacto_email,
  acepta_bs_bcv_dolar, acepta_bs_bcv_euro, acepta_bs_paralela,
  acepta_usd_efectivo, acepta_usd_divisa, notas, activo
)
select 'Mercado La Candelaria', 'Mostrador', '0412-5550101', 'pedidos@mercadocandelaria.demo', true, false, false, true, false, 'Datos de ejemplo (demo de bolo)', true
where not exists (
  select 1 from public.proveedores where lower(nombre) = lower('Mercado La Candelaria')
);

insert into public.proveedores (
  nombre, contacto_nombre, contacto_telefono, contacto_email,
  acepta_bs_bcv_dolar, acepta_bs_bcv_euro, acepta_bs_paralela,
  acepta_usd_efectivo, acepta_usd_divisa, notas, activo
)
select 'Lácteos El Hatillo', 'Pedidos', '0414-5550102', 'pedidos@lacteoshatillo.demo', true, false, false, false, true, 'Datos de ejemplo (demo de bolo)', true
where not exists (
  select 1 from public.proveedores where lower(nombre) = lower('Lácteos El Hatillo')
);

insert into public.proveedores (
  nombre, contacto_nombre, contacto_telefono, contacto_email,
  acepta_bs_bcv_dolar, acepta_bs_bcv_euro, acepta_bs_paralela,
  acepta_usd_efectivo, acepta_usd_divisa, notas, activo
)
select 'Avícola Los Ruices', 'Despacho', '0424-5550103', 'despacho@avicolaruices.demo', false, false, false, true, false, 'Datos de ejemplo (demo de bolo)', true
where not exists (
  select 1 from public.proveedores where lower(nombre) = lower('Avícola Los Ruices')
);

-- Insumos (stock en cero: lo suben las compras de abajo)
insert into public.insumos (
  nombre, categoria, unidad_compra, cantidad_por_compra, unidad_base,
  precio_compra_usd, precio_base_usd, stock_actual, stock_comprometido,
  stock_minimo, proveedor_id, notas, activo
)
select 'HARINA DE MAIZ PRECOCIDA', 'panaderia', 'kg', 1000, 'g', 1.8, 0.0018, 0, 0, 4000, (select id from public.proveedores where lower(nombre) = lower('Mercado La Candelaria') limit 1), 'Datos de ejemplo (demo de bolo)', true
where not exists (
  select 1 from public.insumos where nombre = 'HARINA DE MAIZ PRECOCIDA'
);

insert into public.insumos (
  nombre, categoria, unidad_compra, cantidad_por_compra, unidad_base,
  precio_compra_usd, precio_base_usd, stock_actual, stock_comprometido,
  stock_minimo, proveedor_id, notas, activo
)
select 'QUESO BLANCO', 'lacteos', 'kg', 1000, 'g', 7.5, 0.0075, 0, 0, 2000, (select id from public.proveedores where lower(nombre) = lower('Lácteos El Hatillo') limit 1), 'Datos de ejemplo (demo de bolo)', true
where not exists (
  select 1 from public.insumos where nombre = 'QUESO BLANCO'
);

insert into public.insumos (
  nombre, categoria, unidad_compra, cantidad_por_compra, unidad_base,
  precio_compra_usd, precio_base_usd, stock_actual, stock_comprometido,
  stock_minimo, proveedor_id, notas, activo
)
select 'POLLO PECHUGA', 'proteinas', 'kg', 1000, 'g', 6.4, 0.0064, 0, 0, 2500, (select id from public.proveedores where lower(nombre) = lower('Avícola Los Ruices') limit 1), 'Datos de ejemplo (demo de bolo)', true
where not exists (
  select 1 from public.insumos where nombre = 'POLLO PECHUGA'
);

insert into public.insumos (
  nombre, categoria, unidad_compra, cantidad_por_compra, unidad_base,
  precio_compra_usd, precio_base_usd, stock_actual, stock_comprometido,
  stock_minimo, proveedor_id, notas, activo
)
select 'CEBOLLA', 'frutas', 'kg', 1000, 'g', 1.2, 0.0012, 0, 0, 800, (select id from public.proveedores where lower(nombre) = lower('Mercado La Candelaria') limit 1), 'Datos de ejemplo (demo de bolo)', true
where not exists (
  select 1 from public.insumos where nombre = 'CEBOLLA'
);

insert into public.insumos (
  nombre, categoria, unidad_compra, cantidad_por_compra, unidad_base,
  precio_compra_usd, precio_base_usd, stock_actual, stock_comprometido,
  stock_minimo, proveedor_id, notas, activo
)
select 'PIMENTON', 'frutas', 'kg', 1000, 'g', 1.8, 0.0018, 0, 0, 500, (select id from public.proveedores where lower(nombre) = lower('Mercado La Candelaria') limit 1), 'Datos de ejemplo (demo de bolo)', true
where not exists (
  select 1 from public.insumos where nombre = 'PIMENTON'
);

insert into public.insumos (
  nombre, categoria, unidad_compra, cantidad_por_compra, unidad_base,
  precio_compra_usd, precio_base_usd, stock_actual, stock_comprometido,
  stock_minimo, proveedor_id, notas, activo
)
select 'ACEITE VEGETAL', 'condimentos', 'L', 1000, 'ml', 3.4, 0.0034, 0, 0, 400, (select id from public.proveedores where lower(nombre) = lower('Mercado La Candelaria') limit 1), 'Datos de ejemplo (demo de bolo)', true
where not exists (
  select 1 from public.insumos where nombre = 'ACEITE VEGETAL'
);

insert into public.insumos (
  nombre, categoria, unidad_compra, cantidad_por_compra, unidad_base,
  precio_compra_usd, precio_base_usd, stock_actual, stock_comprometido,
  stock_minimo, proveedor_id, notas, activo
)
select 'SAL', 'condimentos', 'kg', 1000, 'g', 0.8, 0.0008, 0, 0, 200, (select id from public.proveedores where lower(nombre) = lower('Mercado La Candelaria') limit 1), 'Datos de ejemplo (demo de bolo)', true
where not exists (
  select 1 from public.insumos where nombre = 'SAL'
);

insert into public.insumos (
  nombre, categoria, unidad_compra, cantidad_por_compra, unidad_base,
  precio_compra_usd, precio_base_usd, stock_actual, stock_comprometido,
  stock_minimo, proveedor_id, notas, activo
)
select 'PARCHITA', 'frutas', 'kg', 1000, 'g', 2.6, 0.0026, 0, 0, 1500, (select id from public.proveedores where lower(nombre) = lower('Mercado La Candelaria') limit 1), 'Datos de ejemplo (demo de bolo)', true
where not exists (
  select 1 from public.insumos where nombre = 'PARCHITA'
);

insert into public.insumos (
  nombre, categoria, unidad_compra, cantidad_por_compra, unidad_base,
  precio_compra_usd, precio_base_usd, stock_actual, stock_comprometido,
  stock_minimo, proveedor_id, notas, activo
)
select 'AZUCAR', 'otros', 'kg', 1000, 'g', 1.1, 0.0011, 0, 0, 400, (select id from public.proveedores where lower(nombre) = lower('Mercado La Candelaria') limit 1), 'Datos de ejemplo (demo de bolo)', true
where not exists (
  select 1 from public.insumos where nombre = 'AZUCAR'
);

insert into public.insumos (
  nombre, categoria, unidad_compra, cantidad_por_compra, unidad_base,
  precio_compra_usd, precio_base_usd, stock_actual, stock_comprometido,
  stock_minimo, proveedor_id, notas, activo
)
select 'AGUACATE', 'frutas', 'unidad', 1, 'unidad', 1.1, 1.1, 0, 0, 12, (select id from public.proveedores where lower(nombre) = lower('Mercado La Candelaria') limit 1), 'Datos de ejemplo (demo de bolo)', true
where not exists (
  select 1 from public.insumos where nombre = 'AGUACATE'
);

-- Recetas
insert into public.recetas (
  nombre, categoria, porciones, tiempo_prep_min, tiempo_coccion_min,
  procedimiento, precio_sugerido_usd, notas_chef, activo
)
select 'AREPA CON QUESO', 'desayuno', 10, 15, 10, 'Mezcla la harina con agua y una pizca de sal hasta una masa suave. Arma arepas de 80 g y cuécelas en budare. Ábrelas y rellena con queso blanco.', 3.5, 'Datos de ejemplo (demo de bolo)', true
where not exists (
  select 1 from public.recetas where nombre = 'AREPA CON QUESO'
);

insert into public.receta_ingredientes (
  receta_id, insumo_id, nombre, cantidad, unidad, orden
)
select r.id, i.id, 'HARINA DE MAIZ PRECOCIDA', 800, 'g', 0
from public.recetas r
join public.insumos i on i.nombre = 'HARINA DE MAIZ PRECOCIDA'
where r.nombre = 'AREPA CON QUESO'
  and r.notas_chef = 'Datos de ejemplo (demo de bolo)'
  and not exists (
    select 1 from public.receta_ingredientes ri
    where ri.receta_id = r.id and ri.nombre = 'HARINA DE MAIZ PRECOCIDA'
  );

insert into public.receta_ingredientes (
  receta_id, insumo_id, nombre, cantidad, unidad, orden
)
select r.id, i.id, 'QUESO BLANCO', 500, 'g', 1
from public.recetas r
join public.insumos i on i.nombre = 'QUESO BLANCO'
where r.nombre = 'AREPA CON QUESO'
  and r.notas_chef = 'Datos de ejemplo (demo de bolo)'
  and not exists (
    select 1 from public.receta_ingredientes ri
    where ri.receta_id = r.id and ri.nombre = 'QUESO BLANCO'
  );

insert into public.receta_ingredientes (
  receta_id, insumo_id, nombre, cantidad, unidad, orden
)
select r.id, i.id, 'SAL', 8, 'g', 2
from public.recetas r
join public.insumos i on i.nombre = 'SAL'
where r.nombre = 'AREPA CON QUESO'
  and r.notas_chef = 'Datos de ejemplo (demo de bolo)'
  and not exists (
    select 1 from public.receta_ingredientes ri
    where ri.receta_id = r.id and ri.nombre = 'SAL'
  );

insert into public.recetas (
  nombre, categoria, porciones, tiempo_prep_min, tiempo_coccion_min,
  procedimiento, precio_sugerido_usd, notas_chef, activo
)
select 'POLLO A LA PLANCHA', 'plato', 8, 15, 20, 'Sazona la pechuga con sal. Dora el pollo a la plancha con un hilo de aceite. Saltea cebolla y pimentón y sírvelos encima.', 8, 'Datos de ejemplo (demo de bolo)', true
where not exists (
  select 1 from public.recetas where nombre = 'POLLO A LA PLANCHA'
);

insert into public.receta_ingredientes (
  receta_id, insumo_id, nombre, cantidad, unidad, orden
)
select r.id, i.id, 'POLLO PECHUGA', 1600, 'g', 0
from public.recetas r
join public.insumos i on i.nombre = 'POLLO PECHUGA'
where r.nombre = 'POLLO A LA PLANCHA'
  and r.notas_chef = 'Datos de ejemplo (demo de bolo)'
  and not exists (
    select 1 from public.receta_ingredientes ri
    where ri.receta_id = r.id and ri.nombre = 'POLLO PECHUGA'
  );

insert into public.receta_ingredientes (
  receta_id, insumo_id, nombre, cantidad, unidad, orden
)
select r.id, i.id, 'CEBOLLA', 320, 'g', 1
from public.recetas r
join public.insumos i on i.nombre = 'CEBOLLA'
where r.nombre = 'POLLO A LA PLANCHA'
  and r.notas_chef = 'Datos de ejemplo (demo de bolo)'
  and not exists (
    select 1 from public.receta_ingredientes ri
    where ri.receta_id = r.id and ri.nombre = 'CEBOLLA'
  );

insert into public.receta_ingredientes (
  receta_id, insumo_id, nombre, cantidad, unidad, orden
)
select r.id, i.id, 'PIMENTON', 240, 'g', 2
from public.recetas r
join public.insumos i on i.nombre = 'PIMENTON'
where r.nombre = 'POLLO A LA PLANCHA'
  and r.notas_chef = 'Datos de ejemplo (demo de bolo)'
  and not exists (
    select 1 from public.receta_ingredientes ri
    where ri.receta_id = r.id and ri.nombre = 'PIMENTON'
  );

insert into public.receta_ingredientes (
  receta_id, insumo_id, nombre, cantidad, unidad, orden
)
select r.id, i.id, 'ACEITE VEGETAL', 80, 'ml', 3
from public.recetas r
join public.insumos i on i.nombre = 'ACEITE VEGETAL'
where r.nombre = 'POLLO A LA PLANCHA'
  and r.notas_chef = 'Datos de ejemplo (demo de bolo)'
  and not exists (
    select 1 from public.receta_ingredientes ri
    where ri.receta_id = r.id and ri.nombre = 'ACEITE VEGETAL'
  );

insert into public.receta_ingredientes (
  receta_id, insumo_id, nombre, cantidad, unidad, orden
)
select r.id, i.id, 'SAL', 12, 'g', 4
from public.recetas r
join public.insumos i on i.nombre = 'SAL'
where r.nombre = 'POLLO A LA PLANCHA'
  and r.notas_chef = 'Datos de ejemplo (demo de bolo)'
  and not exists (
    select 1 from public.receta_ingredientes ri
    where ri.receta_id = r.id and ri.nombre = 'SAL'
  );

insert into public.recetas (
  nombre, categoria, porciones, tiempo_prep_min, tiempo_coccion_min,
  procedimiento, precio_sugerido_usd, notas_chef, activo
)
select 'JUGO DE PARCHITA', 'jugos', 8, 10, null, 'Licúa la pulpa de parchita con agua y azúcar. Cuela y sirve frío.', 2.5, 'Datos de ejemplo (demo de bolo)', true
where not exists (
  select 1 from public.recetas where nombre = 'JUGO DE PARCHITA'
);

insert into public.receta_ingredientes (
  receta_id, insumo_id, nombre, cantidad, unidad, orden
)
select r.id, i.id, 'PARCHITA', 1600, 'g', 0
from public.recetas r
join public.insumos i on i.nombre = 'PARCHITA'
where r.nombre = 'JUGO DE PARCHITA'
  and r.notas_chef = 'Datos de ejemplo (demo de bolo)'
  and not exists (
    select 1 from public.receta_ingredientes ri
    where ri.receta_id = r.id and ri.nombre = 'PARCHITA'
  );

insert into public.receta_ingredientes (
  receta_id, insumo_id, nombre, cantidad, unidad, orden
)
select r.id, i.id, 'AZUCAR', 200, 'g', 1
from public.recetas r
join public.insumos i on i.nombre = 'AZUCAR'
where r.nombre = 'JUGO DE PARCHITA'
  and r.notas_chef = 'Datos de ejemplo (demo de bolo)'
  and not exists (
    select 1 from public.receta_ingredientes ri
    where ri.receta_id = r.id and ri.nombre = 'AZUCAR'
  );

insert into public.recetas (
  nombre, categoria, porciones, tiempo_prep_min, tiempo_coccion_min,
  procedimiento, precio_sugerido_usd, notas_chef, activo
)
select 'ENSALADA DE AGUACATE', 'plato', 6, 10, null, 'Corta el aguacate y la cebolla. Aliña con aceite y sal justo antes de servir.', 4.5, 'Datos de ejemplo (demo de bolo)', true
where not exists (
  select 1 from public.recetas where nombre = 'ENSALADA DE AGUACATE'
);

insert into public.receta_ingredientes (
  receta_id, insumo_id, nombre, cantidad, unidad, orden
)
select r.id, i.id, 'AGUACATE', 6, 'unidad', 0
from public.recetas r
join public.insumos i on i.nombre = 'AGUACATE'
where r.nombre = 'ENSALADA DE AGUACATE'
  and r.notas_chef = 'Datos de ejemplo (demo de bolo)'
  and not exists (
    select 1 from public.receta_ingredientes ri
    where ri.receta_id = r.id and ri.nombre = 'AGUACATE'
  );

insert into public.receta_ingredientes (
  receta_id, insumo_id, nombre, cantidad, unidad, orden
)
select r.id, i.id, 'CEBOLLA', 180, 'g', 1
from public.recetas r
join public.insumos i on i.nombre = 'CEBOLLA'
where r.nombre = 'ENSALADA DE AGUACATE'
  and r.notas_chef = 'Datos de ejemplo (demo de bolo)'
  and not exists (
    select 1 from public.receta_ingredientes ri
    where ri.receta_id = r.id and ri.nombre = 'CEBOLLA'
  );

insert into public.receta_ingredientes (
  receta_id, insumo_id, nombre, cantidad, unidad, orden
)
select r.id, i.id, 'ACEITE VEGETAL', 90, 'ml', 2
from public.recetas r
join public.insumos i on i.nombre = 'ACEITE VEGETAL'
where r.nombre = 'ENSALADA DE AGUACATE'
  and r.notas_chef = 'Datos de ejemplo (demo de bolo)'
  and not exists (
    select 1 from public.receta_ingredientes ri
    where ri.receta_id = r.id and ri.nombre = 'ACEITE VEGETAL'
  );

insert into public.receta_ingredientes (
  receta_id, insumo_id, nombre, cantidad, unidad, orden
)
select r.id, i.id, 'SAL', 6, 'g', 3
from public.recetas r
join public.insumos i on i.nombre = 'SAL'
where r.nombre = 'ENSALADA DE AGUACATE'
  and r.notas_chef = 'Datos de ejemplo (demo de bolo)'
  and not exists (
    select 1 from public.receta_ingredientes ri
    where ri.receta_id = r.id and ri.nombre = 'SAL'
  );

-- Compras (el trigger suma stock y refresca el precio)
insert into public.compras (
  insumo_id, proveedor_id, fecha, cantidad, precio_total_usd,
  modalidad_pago, notas, pagada, fecha_pago, numero_factura
)
select i.id, p.id, current_date - 5, 3, 5.4,
  'efectivo', 'Datos de ejemplo (demo de bolo)', true, current_date - 5, null
from public.insumos i
join public.proveedores p on lower(p.nombre) = lower('Mercado La Candelaria')
where i.nombre = 'HARINA DE MAIZ PRECOCIDA'
  and i.notas = 'Datos de ejemplo (demo de bolo)'
  and not exists (
    select 1 from public.compras c where c.insumo_id = i.id and c.notas = 'Datos de ejemplo (demo de bolo)'
  );

insert into public.compras (
  insumo_id, proveedor_id, fecha, cantidad, precio_total_usd,
  modalidad_pago, notas, pagada, fecha_pago, numero_factura
)
select i.id, p.id, current_date - 4, 2, 15,
  'bcv_dolar', 'Datos de ejemplo (demo de bolo)', true, current_date - 4, null
from public.insumos i
join public.proveedores p on lower(p.nombre) = lower('Lácteos El Hatillo')
where i.nombre = 'QUESO BLANCO'
  and i.notas = 'Datos de ejemplo (demo de bolo)'
  and not exists (
    select 1 from public.compras c where c.insumo_id = i.id and c.notas = 'Datos de ejemplo (demo de bolo)'
  );

insert into public.compras (
  insumo_id, proveedor_id, fecha, cantidad, precio_total_usd,
  modalidad_pago, notas, pagada, fecha_pago, numero_factura
)
select i.id, p.id, current_date - 3, 4, 25.6,
  'efectivo', 'Datos de ejemplo (demo de bolo)', false, null, 'DEMO-220'
from public.insumos i
join public.proveedores p on lower(p.nombre) = lower('Avícola Los Ruices')
where i.nombre = 'POLLO PECHUGA'
  and i.notas = 'Datos de ejemplo (demo de bolo)'
  and not exists (
    select 1 from public.compras c where c.insumo_id = i.id and c.notas = 'Datos de ejemplo (demo de bolo)'
  );

insert into public.compras (
  insumo_id, proveedor_id, fecha, cantidad, precio_total_usd,
  modalidad_pago, notas, pagada, fecha_pago, numero_factura
)
select i.id, p.id, current_date - 3, 1, 1.2,
  'efectivo', 'Datos de ejemplo (demo de bolo)', true, current_date - 3, null
from public.insumos i
join public.proveedores p on lower(p.nombre) = lower('Mercado La Candelaria')
where i.nombre = 'CEBOLLA'
  and i.notas = 'Datos de ejemplo (demo de bolo)'
  and not exists (
    select 1 from public.compras c where c.insumo_id = i.id and c.notas = 'Datos de ejemplo (demo de bolo)'
  );

insert into public.compras (
  insumo_id, proveedor_id, fecha, cantidad, precio_total_usd,
  modalidad_pago, notas, pagada, fecha_pago, numero_factura
)
select i.id, p.id, current_date - 6, 2, 6.8,
  'efectivo', 'Datos de ejemplo (demo de bolo)', true, current_date - 6, null
from public.insumos i
join public.proveedores p on lower(p.nombre) = lower('Mercado La Candelaria')
where i.nombre = 'ACEITE VEGETAL'
  and i.notas = 'Datos de ejemplo (demo de bolo)'
  and not exists (
    select 1 from public.compras c where c.insumo_id = i.id and c.notas = 'Datos de ejemplo (demo de bolo)'
  );

insert into public.compras (
  insumo_id, proveedor_id, fecha, cantidad, precio_total_usd,
  modalidad_pago, notas, pagada, fecha_pago, numero_factura
)
select i.id, p.id, current_date - 6, 1, 0.8,
  'efectivo', 'Datos de ejemplo (demo de bolo)', true, current_date - 6, null
from public.insumos i
join public.proveedores p on lower(p.nombre) = lower('Mercado La Candelaria')
where i.nombre = 'SAL'
  and i.notas = 'Datos de ejemplo (demo de bolo)'
  and not exists (
    select 1 from public.compras c where c.insumo_id = i.id and c.notas = 'Datos de ejemplo (demo de bolo)'
  );

insert into public.compras (
  insumo_id, proveedor_id, fecha, cantidad, precio_total_usd,
  modalidad_pago, notas, pagada, fecha_pago, numero_factura
)
select i.id, p.id, current_date - 2, 2, 5.2,
  'efectivo', 'Datos de ejemplo (demo de bolo)', true, current_date - 2, null
from public.insumos i
join public.proveedores p on lower(p.nombre) = lower('Mercado La Candelaria')
where i.nombre = 'PARCHITA'
  and i.notas = 'Datos de ejemplo (demo de bolo)'
  and not exists (
    select 1 from public.compras c where c.insumo_id = i.id and c.notas = 'Datos de ejemplo (demo de bolo)'
  );

insert into public.compras (
  insumo_id, proveedor_id, fecha, cantidad, precio_total_usd,
  modalidad_pago, notas, pagada, fecha_pago, numero_factura
)
select i.id, p.id, current_date - 6, 1, 1.1,
  'efectivo', 'Datos de ejemplo (demo de bolo)', true, current_date - 6, null
from public.insumos i
join public.proveedores p on lower(p.nombre) = lower('Mercado La Candelaria')
where i.nombre = 'AZUCAR'
  and i.notas = 'Datos de ejemplo (demo de bolo)'
  and not exists (
    select 1 from public.compras c where c.insumo_id = i.id and c.notas = 'Datos de ejemplo (demo de bolo)'
  );

insert into public.compras (
  insumo_id, proveedor_id, fecha, cantidad, precio_total_usd,
  modalidad_pago, notas, pagada, fecha_pago, numero_factura
)
select i.id, p.id, current_date - 2, 6, 6.6,
  'efectivo', 'Datos de ejemplo (demo de bolo)', true, current_date - 2, null
from public.insumos i
join public.proveedores p on lower(p.nombre) = lower('Mercado La Candelaria')
where i.nombre = 'AGUACATE'
  and i.notas = 'Datos de ejemplo (demo de bolo)'
  and not exists (
    select 1 from public.compras c where c.insumo_id = i.id and c.notas = 'Datos de ejemplo (demo de bolo)'
  );

-- Ventas (el trigger descuenta los ingredientes de la receta)
insert into public.ventas (
  fecha, receta_id, receta_nombre, cantidad, precio_unitario_usd,
  total_usd, fuente, notas, tipo_item
)
select current_date - 2, r.id, r.nombre, 12, 3.5,
  42, 'manual', 'Datos de ejemplo (demo de bolo)', 'insumo'
from public.recetas r
where r.nombre = 'AREPA CON QUESO'
  and r.notas_chef = 'Datos de ejemplo (demo de bolo)'
  and not exists (
    select 1 from public.ventas v where v.receta_id = r.id and v.notas = 'Datos de ejemplo (demo de bolo)'
  );

insert into public.ventas (
  fecha, receta_id, receta_nombre, cantidad, precio_unitario_usd,
  total_usd, fuente, notas, tipo_item
)
select current_date - 1, r.id, r.nombre, 6, 8,
  48, 'manual', 'Datos de ejemplo (demo de bolo)', 'insumo'
from public.recetas r
where r.nombre = 'POLLO A LA PLANCHA'
  and r.notas_chef = 'Datos de ejemplo (demo de bolo)'
  and not exists (
    select 1 from public.ventas v where v.receta_id = r.id and v.notas = 'Datos de ejemplo (demo de bolo)'
  );

insert into public.ventas (
  fecha, receta_id, receta_nombre, cantidad, precio_unitario_usd,
  total_usd, fuente, notas, tipo_item
)
select current_date - 1, r.id, r.nombre, 4, 2.5,
  10, 'manual', 'Datos de ejemplo (demo de bolo)', 'insumo'
from public.recetas r
where r.nombre = 'JUGO DE PARCHITA'
  and r.notas_chef = 'Datos de ejemplo (demo de bolo)'
  and not exists (
    select 1 from public.ventas v where v.receta_id = r.id and v.notas = 'Datos de ejemplo (demo de bolo)'
  );

insert into public.ventas (
  fecha, receta_id, receta_nombre, cantidad, precio_unitario_usd,
  total_usd, fuente, notas, tipo_item
)
select current_date - 0, r.id, r.nombre, 4, 4.5,
  18, 'manual', 'Datos de ejemplo (demo de bolo)', 'insumo'
from public.recetas r
where r.nombre = 'ENSALADA DE AGUACATE'
  and r.notas_chef = 'Datos de ejemplo (demo de bolo)'
  and not exists (
    select 1 from public.ventas v where v.receta_id = r.id and v.notas = 'Datos de ejemplo (demo de bolo)'
  );

-- Menaje
insert into public.menaje_items (
  nombre, categoria, descripcion, cantidad_actual, cantidad_inicial,
  precio_reposicion_usd, notas, activo
)
select 'Plato hondo 24 cm', 'Vajilla', 'Plato hondo para sopa y pasta.', 36, 36, 4.2, 'Datos de ejemplo (demo de bolo)', true
where not exists (
  select 1 from public.menaje_items where lower(nombre) = lower('Plato hondo 24 cm')
);

insert into public.menaje_items (
  nombre, categoria, descripcion, cantidad_actual, cantidad_inicial,
  precio_reposicion_usd, notas, activo
)
select 'Vaso de agua', 'Cristalería', 'Vaso liso de mesa.', 24, 24, 2.8, 'Datos de ejemplo (demo de bolo)', true
where not exists (
  select 1 from public.menaje_items where lower(nombre) = lower('Vaso de agua')
);

insert into public.menaje_items (
  nombre, categoria, descripcion, cantidad_actual, cantidad_inicial,
  precio_reposicion_usd, notas, activo
)
select 'Tenedor de mesa', 'Cubiertos', 'Tenedor de acero para el servicio.', 40, 40, 1.1, 'Datos de ejemplo (demo de bolo)', true
where not exists (
  select 1 from public.menaje_items where lower(nombre) = lower('Tenedor de mesa')
);

