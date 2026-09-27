-- Eventos · Checklist + Cronograma + Plantillas
-- Replica el flujo del spreadsheet de Beatriz: tareas por fase del evento +
-- run-of-show del día + plantillas reutilizables para no empezar de cero.
-- Aditivo, no toca la tabla `eventos` existente.

-- ════════════════════════════════════════════════════════════════
-- 1. TAREAS POR EVENTO (checklist de planificación)
-- ════════════════════════════════════════════════════════════════
create table if not exists public.evento_tareas (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.eventos(id) on delete cascade,
  fase text not null default 'pre-pro',  -- pre-pro | montaje | ejecucion | desmontaje | cierre (texto libre)
  titulo text not null,
  responsable text,                       -- texto libre: "Quinta Mamá", "Aurora", "Evenseg", etc.
  notas text,
  fecha_limite date,
  completada boolean not null default false,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_evento_tareas_evento
  on public.evento_tareas(evento_id);
create index if not exists idx_evento_tareas_fase
  on public.evento_tareas(fase);

alter table public.evento_tareas enable row level security;

drop policy if exists "evt_tareas_select" on public.evento_tareas;
create policy "evt_tareas_select" on public.evento_tareas
  for select to authenticated using (true);
drop policy if exists "evt_tareas_insert" on public.evento_tareas;
create policy "evt_tareas_insert" on public.evento_tareas
  for insert to authenticated with check (true);
drop policy if exists "evt_tareas_update" on public.evento_tareas;
create policy "evt_tareas_update" on public.evento_tareas
  for update to authenticated using (true) with check (true);
drop policy if exists "evt_tareas_delete" on public.evento_tareas;
create policy "evt_tareas_delete" on public.evento_tareas
  for delete to authenticated using (true);

drop trigger if exists evt_tareas_set_updated on public.evento_tareas;
create trigger evt_tareas_set_updated
  before update on public.evento_tareas
  for each row execute function public.set_updated_at();

-- ════════════════════════════════════════════════════════════════
-- 2. ACTIVIDADES POR EVENTO (cronograma minuto-a-minuto del día)
-- ════════════════════════════════════════════════════════════════
create table if not exists public.evento_actividades (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.eventos(id) on delete cascade,
  hora time,                              -- ej. 09:00, 18:30
  actividad text not null,
  responsable text,
  ubicacion text,
  observaciones text,
  critica boolean not null default false,  -- tarea crítica (ej. Ready for Guest)
  estatus text not null default 'pendiente',  -- pendiente | hecho | omitido
  orden int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_evento_actividades_evento
  on public.evento_actividades(evento_id);

alter table public.evento_actividades enable row level security;

drop policy if exists "evt_act_select" on public.evento_actividades;
create policy "evt_act_select" on public.evento_actividades
  for select to authenticated using (true);
drop policy if exists "evt_act_insert" on public.evento_actividades;
create policy "evt_act_insert" on public.evento_actividades
  for insert to authenticated with check (true);
drop policy if exists "evt_act_update" on public.evento_actividades;
create policy "evt_act_update" on public.evento_actividades
  for update to authenticated using (true) with check (true);
drop policy if exists "evt_act_delete" on public.evento_actividades;
create policy "evt_act_delete" on public.evento_actividades
  for delete to authenticated using (true);

drop trigger if exists evt_act_set_updated on public.evento_actividades;
create trigger evt_act_set_updated
  before update on public.evento_actividades
  for each row execute function public.set_updated_at();

-- ════════════════════════════════════════════════════════════════
-- 3. PLANTILLAS (cabecera) — reutilizables entre eventos
-- ════════════════════════════════════════════════════════════════
create table if not exists public.evento_plantillas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text,
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

alter table public.evento_plantillas enable row level security;

drop policy if exists "evt_pl_select" on public.evento_plantillas;
create policy "evt_pl_select" on public.evento_plantillas
  for select to authenticated using (true);
drop policy if exists "evt_pl_insert" on public.evento_plantillas;
create policy "evt_pl_insert" on public.evento_plantillas
  for insert to authenticated with check (true);
drop policy if exists "evt_pl_update" on public.evento_plantillas;
create policy "evt_pl_update" on public.evento_plantillas
  for update to authenticated using (true) with check (true);
drop policy if exists "evt_pl_delete" on public.evento_plantillas;
create policy "evt_pl_delete" on public.evento_plantillas
  for delete to authenticated using (true);

drop trigger if exists evt_pl_set_updated on public.evento_plantillas;
create trigger evt_pl_set_updated
  before update on public.evento_plantillas
  for each row execute function public.set_updated_at();

-- ════════════════════════════════════════════════════════════════
-- 4. PLANTILLA · TAREAS (líneas reutilizables del checklist)
-- ════════════════════════════════════════════════════════════════
create table if not exists public.evento_plantilla_tareas (
  id uuid primary key default gen_random_uuid(),
  plantilla_id uuid not null references public.evento_plantillas(id) on delete cascade,
  fase text not null default 'pre-pro',
  titulo text not null,
  responsable text,
  notas text,
  -- dias_offset: cómo calcular la fecha límite al aplicar la plantilla.
  --   null    → sin fecha
  --   N > 0   → N días ANTES del evento (ej. 5 = 5 días antes)
  --   0       → el día del evento
  --   N < 0   → N días DESPUÉS del evento (ej. -3 = 3 días después)
  dias_offset int,
  orden int not null default 0
);

create index if not exists idx_evt_pl_tareas_plantilla
  on public.evento_plantilla_tareas(plantilla_id);

alter table public.evento_plantilla_tareas enable row level security;

drop policy if exists "evt_pl_t_select" on public.evento_plantilla_tareas;
create policy "evt_pl_t_select" on public.evento_plantilla_tareas
  for select to authenticated using (true);
drop policy if exists "evt_pl_t_insert" on public.evento_plantilla_tareas;
create policy "evt_pl_t_insert" on public.evento_plantilla_tareas
  for insert to authenticated with check (true);
drop policy if exists "evt_pl_t_update" on public.evento_plantilla_tareas;
create policy "evt_pl_t_update" on public.evento_plantilla_tareas
  for update to authenticated using (true) with check (true);
drop policy if exists "evt_pl_t_delete" on public.evento_plantilla_tareas;
create policy "evt_pl_t_delete" on public.evento_plantilla_tareas
  for delete to authenticated using (true);

-- ════════════════════════════════════════════════════════════════
-- 5. PLANTILLA · ACTIVIDADES (líneas reutilizables del cronograma)
-- ════════════════════════════════════════════════════════════════
create table if not exists public.evento_plantilla_actividades (
  id uuid primary key default gen_random_uuid(),
  plantilla_id uuid not null references public.evento_plantillas(id) on delete cascade,
  hora time,
  actividad text not null,
  responsable text,
  ubicacion text,
  observaciones text,
  critica boolean not null default false,
  orden int not null default 0
);

create index if not exists idx_evt_pl_act_plantilla
  on public.evento_plantilla_actividades(plantilla_id);

alter table public.evento_plantilla_actividades enable row level security;

drop policy if exists "evt_pl_a_select" on public.evento_plantilla_actividades;
create policy "evt_pl_a_select" on public.evento_plantilla_actividades
  for select to authenticated using (true);
drop policy if exists "evt_pl_a_insert" on public.evento_plantilla_actividades;
create policy "evt_pl_a_insert" on public.evento_plantilla_actividades
  for insert to authenticated with check (true);
drop policy if exists "evt_pl_a_update" on public.evento_plantilla_actividades;
create policy "evt_pl_a_update" on public.evento_plantilla_actividades
  for update to authenticated using (true) with check (true);
drop policy if exists "evt_pl_a_delete" on public.evento_plantilla_actividades;
create policy "evt_pl_a_delete" on public.evento_plantilla_actividades
  for delete to authenticated using (true);
