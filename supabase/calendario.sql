-- Calendario — Agenda unificada de Quinta Mamá
-- Ejecuta este SQL en: Supabase → SQL Editor → New query
--
-- Una sola tabla para todo lo que va al calendario compartido:
--   eventos, reuniones, objetivos/metas y tareas.
-- Cada fila lleva su `tipo` (para diferenciar por color) y un `responsable`
-- (nombre de la persona) para saber "qué le toca a cada quien".
-- Seguridad fila-por-fila (RLS): cualquier usuario logueado puede ver y editar,
-- igual que las tablas `tareas` y `eventos`.

create table if not exists public.calendario_items (
  id uuid primary key default gen_random_uuid(),
  tipo text not null default 'evento',          -- evento | reunion | objetivo | tarea
  titulo text not null,
  fecha date not null,                          -- fecha de inicio (YYYY-MM-DD)
  fecha_fin date,                               -- opcional: último día (rango)
  hora text,                                    -- opcional: "HH:MM"
  responsable text,                             -- nombre de la persona (texto libre)
  area text,                                    -- área (texto libre)
  estado text not null default 'pendiente',     -- pendiente | en_proceso | completado | cancelado
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

alter table public.calendario_items enable row level security;

drop policy if exists "calendario_select_authenticated" on public.calendario_items;
create policy "calendario_select_authenticated"
  on public.calendario_items for select
  to authenticated
  using (true);

drop policy if exists "calendario_insert_authenticated" on public.calendario_items;
create policy "calendario_insert_authenticated"
  on public.calendario_items for insert
  to authenticated
  with check (true);

drop policy if exists "calendario_update_authenticated" on public.calendario_items;
create policy "calendario_update_authenticated"
  on public.calendario_items for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "calendario_delete_authenticated" on public.calendario_items;
create policy "calendario_delete_authenticated"
  on public.calendario_items for delete
  to authenticated
  using (true);

-- Índice para leer rápido por fecha (el calendario ordena/filtra por fecha).
create index if not exists calendario_items_fecha_idx
  on public.calendario_items (fecha);

-- Trigger: mantener updated_at al día. Reusa la función public.set_updated_at()
-- que ya crea schema.sql.
drop trigger if exists calendario_items_set_updated_at on public.calendario_items;
create trigger calendario_items_set_updated_at
  before update on public.calendario_items
  for each row execute function public.set_updated_at();
