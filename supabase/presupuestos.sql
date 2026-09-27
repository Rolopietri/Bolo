-- Schema para Presupuestos — La Quinta Mamá
-- Ejecuta este SQL en: Supabase → SQL Editor → New query
-- Esto NO toca las tablas existentes (tareas, eventos). Es aditivo.

-- ============================================================
-- CATÁLOGO DE SERVICIOS
-- ============================================================
create table if not exists public.services_catalog (
  id uuid primary key default gen_random_uuid(),
  categoria text not null,
  nombre text not null,
  descripcion text,
  unidad text not null,
  precio_unitario numeric(10,2),
  manual boolean not null default false,
  incluido boolean not null default false,
  activo boolean not null default true,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.services_catalog enable row level security;

drop policy if exists "svc_select_auth" on public.services_catalog;
create policy "svc_select_auth" on public.services_catalog
  for select to authenticated using (true);

drop policy if exists "svc_insert_auth" on public.services_catalog;
create policy "svc_insert_auth" on public.services_catalog
  for insert to authenticated with check (true);

drop policy if exists "svc_update_auth" on public.services_catalog;
create policy "svc_update_auth" on public.services_catalog
  for update to authenticated using (true) with check (true);

drop policy if exists "svc_delete_auth" on public.services_catalog;
create policy "svc_delete_auth" on public.services_catalog
  for delete to authenticated using (true);

-- ============================================================
-- PRESUPUESTOS
-- ============================================================
create table if not exists public.presupuestos (
  id uuid primary key default gen_random_uuid(),
  numero text unique not null,

  -- Cliente (inline, sin tabla aparte)
  cliente_nombre text not null,
  cliente_telefono text,
  cliente_email text,
  cliente_rif text,

  -- Evento
  evento_nombre text not null,
  evento_fecha date,
  evento_hora text,

  -- Negocio
  notas text,
  validez_dias int not null default 15,
  descuento numeric(10,2) not null default 0,

  estado text not null default 'borrador',  -- borrador|enviado|aprobado|rechazado
  subtotal numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,

  -- Link a evento si se aprueba
  evento_id uuid references public.eventos(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

alter table public.presupuestos enable row level security;

drop policy if exists "pre_select_auth" on public.presupuestos;
create policy "pre_select_auth" on public.presupuestos
  for select to authenticated using (true);

drop policy if exists "pre_insert_auth" on public.presupuestos;
create policy "pre_insert_auth" on public.presupuestos
  for insert to authenticated with check (true);

drop policy if exists "pre_update_auth" on public.presupuestos;
create policy "pre_update_auth" on public.presupuestos
  for update to authenticated using (true) with check (true);

drop policy if exists "pre_delete_auth" on public.presupuestos;
create policy "pre_delete_auth" on public.presupuestos
  for delete to authenticated using (true);

-- ============================================================
-- ITEMS DE PRESUPUESTO
-- ============================================================
create table if not exists public.presupuesto_items (
  id uuid primary key default gen_random_uuid(),
  presupuesto_id uuid not null references public.presupuestos(id) on delete cascade,
  service_id uuid references public.services_catalog(id) on delete set null,
  nombre text not null,
  categoria text,
  unidad text not null,
  cantidad numeric(10,2) not null default 1,
  precio_unitario numeric(10,2) not null default 0,
  subtotal numeric(10,2) not null default 0,
  orden int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_items_presupuesto on public.presupuesto_items(presupuesto_id);

alter table public.presupuesto_items enable row level security;

drop policy if exists "items_select_auth" on public.presupuesto_items;
create policy "items_select_auth" on public.presupuesto_items
  for select to authenticated using (true);

drop policy if exists "items_insert_auth" on public.presupuesto_items;
create policy "items_insert_auth" on public.presupuesto_items
  for insert to authenticated with check (true);

drop policy if exists "items_update_auth" on public.presupuesto_items;
create policy "items_update_auth" on public.presupuesto_items
  for update to authenticated using (true) with check (true);

drop policy if exists "items_delete_auth" on public.presupuesto_items;
create policy "items_delete_auth" on public.presupuesto_items
  for delete to authenticated using (true);

-- ============================================================
-- TRIGGERS updated_at
-- ============================================================
drop trigger if exists svc_set_updated_at on public.services_catalog;
create trigger svc_set_updated_at
  before update on public.services_catalog
  for each row execute function public.set_updated_at();

drop trigger if exists pre_set_updated_at on public.presupuestos;
create trigger pre_set_updated_at
  before update on public.presupuestos
  for each row execute function public.set_updated_at();

-- ============================================================
-- SECUENCIA PARA NUMERAR PRESUPUESTOS (PRES-2026-001, etc.)
-- ============================================================
create sequence if not exists presupuestos_num_seq start with 1;

-- ============================================================
-- SEED DEL CATÁLOGO (precios del Dossier 2026)
-- ============================================================
insert into public.services_catalog (categoria, nombre, descripcion, unidad, precio_unitario, manual, incluido, orden) values
  -- ESPACIOS
  ('espacio', 'Salón A1 — Galería (114 m²)', 'Full Day. Espacio de mayor visibilidad.', 'dia', 620, false, false, 10),
  ('espacio', 'Salón A1 — Galería (medio día)', 'Medio Día.', 'medio_dia', 325, false, false, 11),
  ('espacio', 'Salón A1 — Galería (mensual)', 'Alquiler fijo mensual.', 'mes', 3000, false, false, 12),
  ('espacio', 'Salón B1 — Multiusos (168 m²)', 'Full Day = 8 bloques (12h).', 'dia', 450, false, false, 20),
  ('espacio', 'Salón B1 — Multiusos (medio día)', 'Medio Día = 4 bloques (6h).', 'medio_dia', 240, false, false, 21),
  ('espacio', 'Salón B1 — Multiusos (bloque 1.5h)', 'Uso por bloque de 1.5h.', 'bloque', 65, false, false, 22),
  ('espacio', 'Salón B1 — Multiusos (mensual)', 'Alquiler fijo mensual.', 'mes', 3000, false, false, 23),
  ('espacio', 'Salón B5 — Terapias (34 m²)', 'Full Day.', 'dia', 180, false, false, 30),
  ('espacio', 'Salón B5 — Terapias (medio día)', 'Medio Día.', 'medio_dia', 110, false, false, 31),
  ('espacio', 'Salón B5 — Terapias (bloque 1.5h)', 'Uso por bloque.', 'bloque', 35, false, false, 32),
  ('espacio', 'Salón B5 — Terapias (mensual)', 'Alquiler fijo mensual.', 'mes', 880, false, false, 33),
  ('espacio', 'Salón C2 — Oficina (39 m²)', 'Solo mensual.', 'mes', 1000, false, false, 40),
  ('espacio', 'Salón C6 — Taller Creativo (38 m²)', 'Full Day.', 'dia', 150, false, false, 50),
  ('espacio', 'Salón C6 — Taller Creativo (mensual)', 'Alquiler fijo mensual.', 'mes', 1000, false, false, 51),
  ('espacio', 'Jardín', 'Alquiler exterior (precio según evento).', 'evento', null, true, false, 60),
  ('espacio', 'Canchas de pádel (ambas)', 'Por bloque de 1.5h. Incluido si se alquila el jardín.', 'bloque', 100, false, false, 70),

  -- CATERING
  ('catering', 'Catering — propuesta del Chef', 'Monto definido por la Chef según el evento. Incluye equipo operativo de cocina.', 'evento', null, true, false, 100),

  -- EQUIPO (por persona, día completo)
  ('equipo', 'Anfitriona', 'Por persona, día completo.', 'persona', 40, false, false, 200),
  ('equipo', 'Mesonero', 'Por persona, día completo.', 'persona', 40, false, false, 201),
  ('equipo', 'Bartender', 'Por persona, día completo.', 'persona', 50, false, false, 202),
  ('equipo', 'Personal de higiene (baño interno)', 'Por persona, día completo.', 'persona', 40, false, false, 203),
  ('equipo', 'Personal de higiene (baño externo)', 'Por persona, día completo.', 'persona', 40, false, false, 204),
  ('equipo', 'Limpieza', 'Por persona, día completo.', 'persona', 40, false, false, 205),

  -- PÁDEL
  ('padel', 'Paleta de pádel', 'Alquiler por paleta.', 'unidad', 10, false, false, 300),
  ('padel', 'Pote de pelotas (3 unidades)', 'Compra de pelotas.', 'unidad', 10, false, false, 301),

  -- TÉCNICO / OTROS
  ('tecnico', 'Sonido — corneta básica', 'Incluida sin costo adicional.', 'evento', 0, false, true, 400),
  ('tecnico', 'Planta eléctrica', 'Servicio adicional.', 'evento', 400, false, false, 401),
  ('otros', 'Valet parking', 'Precio según evento.', 'evento', null, true, false, 500)
on conflict do nothing;
