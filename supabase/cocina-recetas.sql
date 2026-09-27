-- Fase 2 — Recetario (M2)
-- Aditivo. No toca tablas existentes.

-- ============================================================
-- RECETAS
-- ============================================================
create table if not exists public.recetas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  seccion text not null default 'ambos',  -- cafetin | comedor | ambos
  categoria text,                          -- 'smoothie' | 'cafe' | 'sandwich' | 'bowl' | 'desayuno' | etc.
  perfil text,                             -- ej "tropical · cremoso · refrescante"
  porciones int not null default 1,
  tiempo_prep_min int,
  tiempo_coccion_min int,
  temperatura text,
  procedimiento text,
  presentacion text,
  notas_chef text,
  variaciones text,
  responsable text,
  foto_url text,
  precio_sugerido_usd numeric(10, 4),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_recetas_seccion on public.recetas(seccion);
create index if not exists idx_recetas_categoria on public.recetas(categoria);

alter table public.recetas enable row level security;

drop policy if exists "rec_select" on public.recetas;
create policy "rec_select" on public.recetas
  for select to authenticated using (true);
drop policy if exists "rec_insert" on public.recetas;
create policy "rec_insert" on public.recetas
  for insert to authenticated with check (true);
drop policy if exists "rec_update" on public.recetas;
create policy "rec_update" on public.recetas
  for update to authenticated using (true) with check (true);
drop policy if exists "rec_delete" on public.recetas;
create policy "rec_delete" on public.recetas
  for delete to authenticated using (true);

-- ============================================================
-- INGREDIENTES DE LA RECETA
-- ============================================================
create table if not exists public.receta_ingredientes (
  id uuid primary key default gen_random_uuid(),
  receta_id uuid not null references public.recetas(id) on delete cascade,
  insumo_id uuid references public.insumos(id) on delete set null,
  nombre text not null,         -- snapshot (sirve si insumo_id es null)
  cantidad numeric(12, 4) not null,
  unidad text not null,         -- snapshot: 'g', 'ml', 'unidad'
  observaciones text,
  orden int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_ri_receta on public.receta_ingredientes(receta_id, orden);
create index if not exists idx_ri_insumo on public.receta_ingredientes(insumo_id);

alter table public.receta_ingredientes enable row level security;

drop policy if exists "ri_select" on public.receta_ingredientes;
create policy "ri_select" on public.receta_ingredientes
  for select to authenticated using (true);
drop policy if exists "ri_insert" on public.receta_ingredientes;
create policy "ri_insert" on public.receta_ingredientes
  for insert to authenticated with check (true);
drop policy if exists "ri_update" on public.receta_ingredientes;
create policy "ri_update" on public.receta_ingredientes
  for update to authenticated using (true) with check (true);
drop policy if exists "ri_delete" on public.receta_ingredientes;
create policy "ri_delete" on public.receta_ingredientes
  for delete to authenticated using (true);

-- Trigger updated_at
drop trigger if exists rec_set_updated on public.recetas;
create trigger rec_set_updated
  before update on public.recetas
  for each row execute function public.set_updated_at();

-- ============================================================
-- SEED: 7 SMOOTHIES + 4 PLATOS BÁSICOS
-- ============================================================
-- Helper: subquery para obtener insumo_id por nombre (case-insensitive contains)

-- ── SMOOTHIES ────────────────────────────────────────────────────

with r as (
  insert into public.recetas (nombre, seccion, categoria, perfil, porciones, procedimiento, presentacion, precio_sugerido_usd)
  values (
    'Guayaba Sunrise',
    'cafetin',
    'smoothie',
    'tropical · cremoso · refrescante',
    1,
    E'1. Pelar y cortar guayaba y mango\n2. Licuar todos los ingredientes con hielo hasta cremoso\n3. Servir en vaso alto\n4. Decorar con rodaja de mango si se desea',
    'Vaso alto · color amarillo intenso · pajilla biodegradable',
    7.5
  ) returning id
)
insert into public.receta_ingredientes (receta_id, insumo_id, nombre, cantidad, unidad, orden)
select r.id, (select id from public.insumos where nombre ilike 'Guayaba' limit 1), 'Guayaba', 100, 'g', 1 from r union all
select r.id, (select id from public.insumos where nombre ilike 'Mango' limit 1), 'Mango', 100, 'g', 2 from r union all
select r.id, (select id from public.insumos where nombre ilike 'Agua de coco' limit 1), 'Agua de coco', 180, 'ml', 3 from r union all
select r.id, (select id from public.insumos where nombre ilike 'Hielo' limit 1), 'Hielo', 100, 'g', 4 from r;

with r as (
  insert into public.recetas (nombre, seccion, categoria, perfil, porciones, procedimiento, precio_sugerido_usd)
  values (
    'Cacao Papelón Power',
    'cafetin',
    'smoothie',
    'reconfortante · energizante · protein-friendly',
    1,
    E'1. Pelar cambur\n2. Licuar todos los ingredientes hasta lograr textura cremosa\n3. Servir en vaso alto\n4. Espolvorear canela por encima',
    7.5
  ) returning id
)
insert into public.receta_ingredientes (receta_id, insumo_id, nombre, cantidad, unidad, orden)
select r.id, (select id from public.insumos where nombre ilike 'Cambur' limit 1), 'Cambur', 100, 'g', 1 from r union all
select r.id, (select id from public.insumos where nombre ilike 'Leche completa' limit 1), 'Leche', 180, 'ml', 2 from r union all
select r.id, (select id from public.insumos where nombre ilike 'Cacao en polvo' limit 1), 'Cacao en polvo', 12, 'g', 3 from r union all
select r.id, (select id from public.insumos where nombre ilike 'Papelón%' limit 1), 'Papelón pulverizado', 18, 'g', 4 from r union all
select r.id, (select id from public.insumos where nombre ilike 'Hielo' limit 1), 'Hielo', 80, 'g', 5 from r union all
select r.id, (select id from public.insumos where nombre ilike 'Canela' limit 1), 'Canela (pizca)', 2, 'g', 6 from r;

with r as (
  insert into public.recetas (nombre, seccion, categoria, perfil, porciones, procedimiento, presentacion, precio_sugerido_usd, notas_chef)
  values (
    'Parchitada',
    'cafetin',
    'smoothie',
    'cítrico · refrescante · tropical',
    1,
    E'1. Licuar pulpa de parchita con piña y agua de coco\n2. Agregar hielo y hierbabuena\n3. Procesar hasta granizado',
    'Vaso alto · color amarillo brillante · decorar con hierbabuena',
    6,
    'Si la parchita está muy ácida, añadir un toque de papelón'
  ) returning id
)
insert into public.receta_ingredientes (receta_id, insumo_id, nombre, cantidad, unidad, orden)
select r.id, (select id from public.insumos where nombre ilike 'Pulpa de parchita' limit 1), 'Pulpa de parchita', 100, 'g', 1 from r union all
select r.id, (select id from public.insumos where nombre ilike 'Piña' limit 1), 'Piña', 120, 'g', 2 from r union all
select r.id, (select id from public.insumos where nombre ilike 'Agua de coco' limit 1), 'Agua de coco', 200, 'ml', 3 from r union all
select r.id, (select id from public.insumos where nombre ilike 'Hierbabuena' limit 1), 'Hierbabuena (3-4 hojas)', 2, 'g', 4 from r union all
select r.id, (select id from public.insumos where nombre ilike 'Hielo' limit 1), 'Hielo', 100, 'g', 5 from r;

with r as (
  insert into public.recetas (nombre, seccion, categoria, perfil, porciones, procedimiento, precio_sugerido_usd)
  values (
    'Green Ávila',
    'cafetin',
    'smoothie',
    'fresh · green · wellness',
    1,
    E'1. Lavar bien espinaca y celery\n2. Licuar todo con agua de coco\n3. Agregar hielo al final\n4. Servir inmediatamente',
    7.5
  ) returning id
)
insert into public.receta_ingredientes (receta_id, insumo_id, nombre, cantidad, unidad, orden)
select r.id, (select id from public.insumos where nombre ilike 'Espinaca' limit 1), 'Espinaca', 40, 'g', 1 from r union all
select r.id, (select id from public.insumos where nombre ilike 'Celery' limit 1), 'Celery', 30, 'g', 2 from r union all
select r.id, (select id from public.insumos where nombre ilike 'Piña' limit 1), 'Piña', 130, 'g', 3 from r union all
select r.id, (select id from public.insumos where nombre ilike 'Aguacate' limit 1), 'Aguacate', 45, 'g', 4 from r union all
select r.id, (select id from public.insumos where nombre ilike 'Jengibre' limit 1), 'Jengibre', 4, 'g', 5 from r union all
select r.id, (select id from public.insumos where nombre ilike 'Agua de coco' limit 1), 'Agua de coco', 180, 'ml', 6 from r union all
select r.id, (select id from public.insumos where nombre ilike 'Hielo' limit 1), 'Hielo', 100, 'g', 7 from r;

with r as (
  insert into public.recetas (nombre, seccion, categoria, perfil, porciones, procedimiento, presentacion, precio_sugerido_usd, notas_chef)
  values (
    'Fresas con Crema',
    'cafetin',
    'smoothie',
    'creamy · sweet · feel-good',
    1,
    E'1. Licuar fresas con crema de coco y leche\n2. Agregar vainilla\n3. Agregar hielo y procesar hasta cremoso',
    'Vaso alto · color rosa · decorar con fresa cortada en el borde',
    7,
    'Opcional: añadir un poquito de maple o miel si se requiere endulzar'
  ) returning id
)
insert into public.receta_ingredientes (receta_id, insumo_id, nombre, cantidad, unidad, orden)
select r.id, (select id from public.insumos where nombre ilike 'Fresa' limit 1), 'Fresa', 140, 'g', 1 from r union all
select r.id, (select id from public.insumos where nombre ilike 'Crema de coco' limit 1), 'Crema de coco', 60, 'g', 2 from r union all
select r.id, (select id from public.insumos where nombre ilike 'Leche completa' limit 1), 'Leche', 120, 'ml', 3 from r union all
select r.id, (select id from public.insumos where nombre ilike 'Vainilla' limit 1), 'Vainilla', 1, 'ml', 4 from r union all
select r.id, (select id from public.insumos where nombre ilike 'Hielo' limit 1), 'Hielo', 80, 'g', 5 from r;

with r as (
  insert into public.recetas (nombre, seccion, categoria, perfil, porciones, procedimiento, precio_sugerido_usd, notas_chef)
  values (
    'Peanut Butter Cup',
    'cafetin',
    'smoothie',
    'rich · satisfying · post-workout',
    1,
    E'1. Licuar cambur con mantequilla de maní, leche y cacao\n2. Agregar hielo y procesar\n3. Servir inmediatamente',
    8,
    'Recomendado con booster de proteína'
  ) returning id
)
insert into public.receta_ingredientes (receta_id, insumo_id, nombre, cantidad, unidad, orden)
select r.id, (select id from public.insumos where nombre ilike 'Cambur' limit 1), 'Cambur', 100, 'g', 1 from r union all
select r.id, (select id from public.insumos where nombre ilike 'Mantequilla de man%' limit 1), 'Mantequilla de maní', 50, 'g', 2 from r union all
select r.id, (select id from public.insumos where nombre ilike 'Leche completa' limit 1), 'Leche', 180, 'ml', 3 from r union all
select r.id, (select id from public.insumos where nombre ilike 'Cacao en polvo' limit 1), 'Cacao en polvo', 10, 'g', 4 from r union all
select r.id, (select id from public.insumos where nombre ilike 'Hielo' limit 1), 'Hielo', 80, 'g', 5 from r;

with r as (
  insert into public.recetas (nombre, seccion, categoria, perfil, porciones, procedimiento, precio_sugerido_usd, notas_chef)
  values (
    'Vitamina C',
    'cafetin',
    'smoothie',
    'bright · fruity · immune boost',
    1,
    E'1. Licuar fresa y mora con jugo de naranja\n2. Agregar hielo y procesar',
    6,
    'Si está muy ácido, ajustar con mango o cambur pequeño'
  ) returning id
)
insert into public.receta_ingredientes (receta_id, insumo_id, nombre, cantidad, unidad, orden)
select r.id, (select id from public.insumos where nombre ilike 'Fresa' limit 1), 'Fresa', 90, 'g', 1 from r union all
select r.id, (select id from public.insumos where nombre ilike 'Mora' limit 1), 'Mora', 60, 'g', 2 from r union all
select r.id, (select id from public.insumos where nombre ilike 'Jugo de naranja' limit 1), 'Jugo de naranja', 180, 'ml', 3 from r union all
select r.id, (select id from public.insumos where nombre ilike 'Hielo' limit 1), 'Hielo', 100, 'g', 4 from r;


-- ── COMEDOR — DESAYUNOS Y BOWLS ──────────────────────────────────

with r as (
  insert into public.recetas (nombre, seccion, categoria, porciones, tiempo_prep_min, tiempo_coccion_min, procedimiento, presentacion, variaciones)
  values (
    'Desayuno Caraqueño',
    'comedor',
    'desayuno',
    1, 10, 15,
    E'AREPA:\n1. Mezclar harina, agua y sal\n2. Reposar 5 minutos\n3. Formar arepa y cocinar en budare 5-7 min por lado\n\nHUEVOS:\n• Revueltos, fritos, pochados o perico (al gusto)\n\nPERICO (opcional):\n1. Sofreír cebolla y tomate en aceite de oliva\n2. Agregar huevos batidos y revolver\n3. Sal al gusto',
    E'• 1 Arepa (abierta o a un lado)\n• Huevos a un lado\n• Queso arepero a un lado\n• Aguacate en abanico',
    E'Aditivos opcionales: Aguacate · Ají dulce salteado · Aceite de cilantro'
  ) returning id
)
insert into public.receta_ingredientes (receta_id, insumo_id, nombre, cantidad, unidad, orden)
select r.id, (select id from public.insumos where nombre ilike 'Harina PAN' limit 1), 'Harina PAN', 80, 'g', 1 from r union all
select r.id, (select id from public.insumos where nombre ilike 'Queso arepero' limit 1), 'Queso arepero', 70, 'g', 2 from r union all
select r.id, (select id from public.insumos where nombre ilike 'Huevos' limit 1), 'Huevos', 2, 'unidad', 3 from r union all
select r.id, (select id from public.insumos where nombre ilike 'Aguacate' limit 1), 'Aguacate (opcional)', 50, 'g', 4 from r;

with r as (
  insert into public.recetas (nombre, seccion, categoria, porciones, tiempo_prep_min, tiempo_coccion_min, procedimiento, presentacion, variaciones)
  values (
    'Omelette Country',
    'comedor',
    'desayuno',
    1, 5, 8,
    E'1. Batir ligeramente huevos con leche, sal y pimienta\n2. Calentar aceite en sartén\n3. Añadir mezcla de huevos\n4. Añadir trozos de queso de cabra y tomate seco al centro\n5. Formar omelette sin sobrecocer\n6. Emplatar inmediatamente',
    E'Plato limpio · Omelette en el centro · Drizzle de aceite de oregano · Migajas de queso espolvoreadas',
    E'Acompañantes opcionales: 1 arepita · Ensalada fresca (rúcula + limón) · Aguacate'
  ) returning id
)
insert into public.receta_ingredientes (receta_id, insumo_id, nombre, cantidad, unidad, orden)
select r.id, (select id from public.insumos where nombre ilike 'Huevos' limit 1), 'Huevos', 3, 'unidad', 1 from r union all
select r.id, (select id from public.insumos where nombre ilike 'Leche completa' limit 1), 'Leche (opcional)', 10, 'ml', 2 from r union all
select r.id, (select id from public.insumos where nombre ilike 'Aceite de oliva' limit 1), 'Aceite de oliva', 5, 'ml', 3 from r;

with r as (
  insert into public.recetas (nombre, seccion, categoria, porciones, tiempo_prep_min, procedimiento, presentacion, variaciones)
  values (
    'Bowl de Yogurt',
    'comedor',
    'desayuno',
    1, 8,
    E'1. Lavar y cortar frutas en cortes limpios y uniformes\n2. Base de yogurt en bowl\n3. Capa de granola\n4. Capa de frutas frescas\n5. Topping de semillas y coco rallado\n6. Drizzle final de miel o maple',
    E'• Base de yogurt\n• Capa de granola\n• Capa de frutas\n• Topping de semillas\n• Drizzle de miel/maple',
    E'Combinaciones distintas de fruta de temporada · Añadir mantequilla de maní o almendra · Cacao nibs · Proteína · Yogurt de coco (versión vegana)'
  ) returning id
)
insert into public.receta_ingredientes (receta_id, insumo_id, nombre, cantidad, unidad, orden)
select r.id, (select id from public.insumos where nombre ilike 'Yogurt griego' limit 1), 'Yogurt griego', 200, 'g', 1 from r union all
select r.id, (select id from public.insumos where nombre ilike 'Granola' limit 1), 'Granola', 40, 'g', 2 from r union all
select r.id, (select id from public.insumos where nombre ilike 'Fresa' limit 1), 'Fresa', 45, 'g', 3 from r union all
select r.id, (select id from public.insumos where nombre ilike 'Cambur' limit 1), 'Cambur', 45, 'g', 4 from r union all
select r.id, (select id from public.insumos where nombre ilike 'Mora' limit 1), 'Mora / Arándanos / Mango', 30, 'g', 5 from r;

with r as (
  insert into public.recetas (nombre, seccion, categoria, porciones, tiempo_prep_min, tiempo_coccion_min, procedimiento, presentacion, variaciones, notas_chef)
  values (
    'Huevos Mamá',
    'comedor',
    'desayuno',
    1, 10, 8,
    E'BASE:\n1. Cortar conchas de arepa\n2. Calentar pavo\n\nHUEVOS POCHADOS (2:30 - 3 min):\n• Llevar agua con vinagre a hervir suave\n• Pochar los huevos hasta clara firme, yema líquida\n\nHOLANDESA DE AGUACATE:\n1. Licuar aguacate, jugo de limón, aceite de oliva\n2. Ajustar textura con agua tibia\n3. Salar al gusto',
    E'• 2 conchas de arepa de base\n• Pavo\n• 1 huevo pochado sobre cada arepa\n• Drizzle de holandesa de aguacate\n• Toque de flor de sal\n• Pimienta · cebollín (opcional)',
    E'Cambiar pavo por salmón ahumado u otra proteína · Versión vegetariana (sin proteína animal)',
    'La salsa holandesa debe quedar cremosa con un toque de acidez'
  ) returning id
)
insert into public.receta_ingredientes (receta_id, insumo_id, nombre, cantidad, unidad, orden)
select r.id, (select id from public.insumos where nombre ilike 'Harina PAN' limit 1), 'Harina PAN (conchas de arepa)', 80, 'g', 1 from r union all
select r.id, null, 'Pavo', 60, 'g', 2 from r union all
select r.id, (select id from public.insumos where nombre ilike 'Huevos' limit 1), 'Huevos', 2, 'unidad', 3 from r union all
select r.id, (select id from public.insumos where nombre ilike 'Aguacate' limit 1), 'Aguacate (para holandesa)', 80, 'g', 4 from r union all
select r.id, (select id from public.insumos where nombre ilike 'Aceite de oliva' limit 1), 'Aceite de oliva', 25, 'ml', 5 from r;
