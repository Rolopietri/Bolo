-- Schema para Quinta Mamá
-- Ejecuta este SQL en: Supabase → SQL Editor → New query
--
-- Crea las tablas para tareas y eventos, con seguridad fila-por-fila (RLS).
-- Solo los usuarios logueados pueden ver/modificar datos.
-- La whitelist de emails se hace en el código de la app.

-- ============================================================
-- TAREAS
-- ============================================================
create table if not exists public.tareas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  estado text not null default 'pendiente',
  area text,
  prioridad text,
  asignado_a text,
  fecha_limite date,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

alter table public.tareas enable row level security;

drop policy if exists "tareas_select_authenticated" on public.tareas;
create policy "tareas_select_authenticated"
  on public.tareas for select
  to authenticated
  using (true);

drop policy if exists "tareas_insert_authenticated" on public.tareas;
create policy "tareas_insert_authenticated"
  on public.tareas for insert
  to authenticated
  with check (true);

drop policy if exists "tareas_update_authenticated" on public.tareas;
create policy "tareas_update_authenticated"
  on public.tareas for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "tareas_delete_authenticated" on public.tareas;
create policy "tareas_delete_authenticated"
  on public.tareas for delete
  to authenticated
  using (true);

-- ============================================================
-- EVENTOS
-- ============================================================
create table if not exists public.eventos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  fecha date not null,
  estado text not null default 'por_confirmar',
  ubicacion text,
  cliente text,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

alter table public.eventos enable row level security;

drop policy if exists "eventos_select_authenticated" on public.eventos;
create policy "eventos_select_authenticated"
  on public.eventos for select
  to authenticated
  using (true);

drop policy if exists "eventos_insert_authenticated" on public.eventos;
create policy "eventos_insert_authenticated"
  on public.eventos for insert
  to authenticated
  with check (true);

drop policy if exists "eventos_update_authenticated" on public.eventos;
create policy "eventos_update_authenticated"
  on public.eventos for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "eventos_delete_authenticated" on public.eventos;
create policy "eventos_delete_authenticated"
  on public.eventos for delete
  to authenticated
  using (true);

-- ============================================================
-- TRIGGER: actualizar updated_at automáticamente
-- ============================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tareas_set_updated_at on public.tareas;
create trigger tareas_set_updated_at
  before update on public.tareas
  for each row execute function public.set_updated_at();

drop trigger if exists eventos_set_updated_at on public.eventos;
create trigger eventos_set_updated_at
  before update on public.eventos
  for each row execute function public.set_updated_at();

-- ============================================================
-- DATOS DE EJEMPLO (puedes borrarlos después)
-- ============================================================
insert into public.tareas (titulo, estado, area, prioridad, asignado_a) values
  ('Entrega de contratos a inquilinos', 'en_proceso', 'Legal', 'alta', 'Beatriz'),
  ('Coordinar Pop Up Cocol''s Choices + Port de Bras', 'pendiente', 'Eventos', 'media', 'Equipo'),
  ('Revisar pago Corpoelect', 'urgente', 'Finanzas', 'alta', 'Beatriz + Norberto')
on conflict do nothing;

insert into public.eventos (titulo, fecha, estado, notas) values
  ('🛍️ Pop Up Cocol''s Choices + Port de Bras', '2026-05-29', 'por_confirmar', null),
  ('🛍️ Pop Up Costaiia', '2026-05-09', 'por_confirmar', null),
  ('🎉 Evento del 30 de mayo', '2026-05-30', 'confirmado', 'Evento más importante del mes')
on conflict do nothing;
