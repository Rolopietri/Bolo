-- Limpieza de categorías de INSUMO (Fase A del reordenamiento de categorías).
-- El catálogo de Insumos (Cocina) usa ahora insumos.categoria_compra (tipo de
-- materia prima), separado de las categorías de venta de Administración.
-- Este SQL deja categoria_compra y la lista categoria_insumo limpias.
-- NO toca Administración (categoria_producto / admin_categoria) ni Recetario.

-- 1) Remapear valores colados/duplicados a los tipos limpios.
update public.insumos set categoria_compra = 'Bebidas'
  where categoria_compra = 'Bebidas frías embotelladas/enlatadas';
-- Bebidas naturales: coco frío + jugos ya exprimidos (son insumos, no reventa).
update public.insumos set categoria_compra = 'Bebidas naturales'
  where nombre in ('COCO FRIO', 'JUGO DE NARANJA', 'JUGO DE LIMON');
update public.insumos set categoria_compra = 'Café & Té'
  where categoria_compra = 'Café y té';
update public.insumos set categoria_compra = 'Postres y Snacks'
  where categoria_compra in ('Postres', 'Snacks');
update public.insumos set categoria_compra = 'Panadería'
  where categoria_compra = 'Panadería y harinas';
update public.insumos set categoria_compra = 'Proteínas'
  where categoria_compra = 'Adicionales/Extras';
-- Gatorade (todas las variantes) son bebidas.
update public.insumos set categoria_compra = 'Bebidas'
  where nombre like 'GATORADE%';
-- Suplementos: proteína / colágeno en polvo.
update public.insumos set categoria_compra = 'Suplementos'
  where nombre in ('COLAGENO', 'PROTEINA (ISO 100 DYMATIZE)');

-- 2) Clasificar los ex-"Otros" (los que la cascada mandó a "Alquileres fijos").
update public.insumos set categoria_compra = 'Granos y Cereales'
  where nombre in ('ARROZ ARBORIO', 'ARROZ BASMATI');
update public.insumos set categoria_compra = 'Endulzantes'
  where nombre in ('AZUCAR BLANCA (EN SOBRE)', 'AZUCAR BLANCA (KG)', 'SPLENDA');
update public.insumos set categoria_compra = 'Condimentos & Especias'
  where nombre in ('SAL (FINA)', 'BICARBONATO');

-- 3) Lista limpia de categorías de insumo (opciones del catálogo y del gestor
--    "Clasificar insumos"). Se reconstruye para quitar coladas/dups. Sin FK:
--    los insumos guardan el NOMBRE, así que rehacer esta lista es seguro.
delete from public.categoria_insumo;
insert into public.categoria_insumo (nombre, orden) values
  ('Café & Té', 10),
  ('Lácteos', 20),
  ('Frutas & Vegetales', 30),
  ('Panadería', 40),
  ('Proteínas', 50),
  ('Suplementos', 55),
  ('Salsas & Aderezos', 60),
  ('Bebidas', 70),
  ('Bebidas Alcohólicas', 80),
  ('Bebidas naturales', 90),
  ('Condimentos & Especias', 100),
  ('Endulzantes', 110),
  ('Granos y Cereales', 120),
  ('Semillas y Nueces', 130),
  ('Congelados', 140),
  ('Desechables', 150),
  ('Postres y Snacks', 160)
on conflict do nothing;
