-- Fase 3 — Configuración de rentabilidad
-- Tabla singleton (siempre id=1) con parámetros del cálculo:
--   • Food cost objetivo (ej: 30% — para sugerir precio = costo / 0.30)
--   • Gastos operativos % (para utilidad neta = bruta - gastos)
--   • Umbrales del semáforo (margen >= verde → 🟢; >= amarillo → 🟡; < → 🔴)

create table if not exists public.cocina_config (
  id int primary key default 1 check (id = 1),
  food_cost_objetivo_porc numeric(5, 2) not null default 30,
  gastos_operativos_porc numeric(5, 2) not null default 0,
  margen_verde_min numeric(5, 2) not null default 70,
  margen_amarillo_min numeric(5, 2) not null default 60,
  updated_at timestamptz not null default now()
);

insert into public.cocina_config (id) values (1) on conflict do nothing;

alter table public.cocina_config enable row level security;

drop policy if exists "cfg_select" on public.cocina_config;
create policy "cfg_select" on public.cocina_config
  for select to authenticated using (true);

drop policy if exists "cfg_update" on public.cocina_config;
create policy "cfg_update" on public.cocina_config
  for update to authenticated using (true) with check (true);

drop policy if exists "cfg_insert" on public.cocina_config;
create policy "cfg_insert" on public.cocina_config
  for insert to authenticated with check (true);
