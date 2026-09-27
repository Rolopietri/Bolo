-- Presupuestos · Historial de versiones
-- Cada vez que se edita un presupuesto, guardamos un snapshot completo del
-- estado anterior antes de aplicar los cambios. Así dentro del mismo
-- presupuesto se ve cómo fue evolucionando — qué se ofreció antes, por qué
-- el cliente lo rechazó o pidió cambios, etc.
--
-- Snapshot guardado como JSONB: incluye cabecera + items completos.
-- Aditivo, idempotente.

create table if not exists public.presupuestos_versiones (
  id uuid primary key default gen_random_uuid(),
  presupuesto_id uuid not null references public.presupuestos(id) on delete cascade,
  version_numero int not null,         -- 1, 2, 3, ... orden cronológico
  snapshot jsonb not null,             -- {cabecera, items[]} de cómo estaba antes del cambio
  motivo text,                         -- opcional: por qué se editó (rechazo, ajuste, etc.)
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_pv_pres on public.presupuestos_versiones(presupuesto_id);
create index if not exists idx_pv_fecha on public.presupuestos_versiones(created_at desc);

alter table public.presupuestos_versiones enable row level security;

drop policy if exists "pv_select" on public.presupuestos_versiones;
create policy "pv_select" on public.presupuestos_versiones
  for select to authenticated using (true);

drop policy if exists "pv_insert" on public.presupuestos_versiones;
create policy "pv_insert" on public.presupuestos_versiones
  for insert to authenticated with check (true);

drop policy if exists "pv_delete" on public.presupuestos_versiones;
create policy "pv_delete" on public.presupuestos_versiones
  for delete to authenticated using (true);

-- Constraint útil: el (presupuesto_id, version_numero) debe ser único
create unique index if not exists uk_pv_pres_version
  on public.presupuestos_versiones(presupuesto_id, version_numero);
