-- Cómo registra el restaurante sus ventas.
-- Un solo local (fila id = 1), compartido por todos los usuarios.
-- ventas_manual: anotar platos a mano al cierre del día.
-- ventas_pos: subir el cierre del sistema de caja (Xetux / Setux).
-- Las dos pueden estar activas a la vez. Por defecto, las dos.

create table if not exists public.restaurante_ajustes (
  id int primary key default 1 check (id = 1),
  ventas_manual boolean not null default true,
  ventas_pos boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.restaurante_ajustes (id)
values (1)
on conflict (id) do nothing;

alter table public.restaurante_ajustes enable row level security;

drop policy if exists "ajustes_select" on public.restaurante_ajustes;
create policy "ajustes_select" on public.restaurante_ajustes
  for select to authenticated using (true);

drop policy if exists "ajustes_insert" on public.restaurante_ajustes;
create policy "ajustes_insert" on public.restaurante_ajustes
  for insert to authenticated with check (true);

drop policy if exists "ajustes_update" on public.restaurante_ajustes;
create policy "ajustes_update" on public.restaurante_ajustes
  for update to authenticated using (true) with check (true);
