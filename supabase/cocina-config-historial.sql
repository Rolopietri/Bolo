-- Cocina · Historial de cambios en cocina_config (M4 trazabilidad)
-- Registra cada modificación de food_cost, gastos, semáforo o IVA con fecha,
-- valor anterior, valor nuevo y usuario.
--
-- Idempotente.

create table if not exists public.cocina_config_historial (
  id uuid primary key default gen_random_uuid(),
  campo text not null,             -- 'food_cost_objetivo_porc' | 'gastos_operativos_porc' | ...
  valor_anterior numeric(5, 2),
  valor_nuevo numeric(5, 2) not null,
  changed_at timestamptz not null default now(),
  changed_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_cfg_hist_changed on public.cocina_config_historial(changed_at desc);

alter table public.cocina_config_historial enable row level security;

drop policy if exists "cfgh_select" on public.cocina_config_historial;
create policy "cfgh_select" on public.cocina_config_historial
  for select to authenticated using (true);
drop policy if exists "cfgh_insert" on public.cocina_config_historial;
create policy "cfgh_insert" on public.cocina_config_historial
  for insert to authenticated with check (true);

-- Trigger: cuando cambia cualquier campo de cocina_config, insertar fila por
-- cada campo modificado.
create or replace function public.log_cocina_config_change()
returns trigger language plpgsql as $$
begin
  if old.food_cost_objetivo_porc is distinct from new.food_cost_objetivo_porc then
    insert into public.cocina_config_historial (campo, valor_anterior, valor_nuevo, changed_by)
    values ('food_cost_objetivo_porc', old.food_cost_objetivo_porc, new.food_cost_objetivo_porc, auth.uid());
  end if;
  if old.gastos_operativos_porc is distinct from new.gastos_operativos_porc then
    insert into public.cocina_config_historial (campo, valor_anterior, valor_nuevo, changed_by)
    values ('gastos_operativos_porc', old.gastos_operativos_porc, new.gastos_operativos_porc, auth.uid());
  end if;
  if old.margen_verde_min is distinct from new.margen_verde_min then
    insert into public.cocina_config_historial (campo, valor_anterior, valor_nuevo, changed_by)
    values ('margen_verde_min', old.margen_verde_min, new.margen_verde_min, auth.uid());
  end if;
  if old.margen_amarillo_min is distinct from new.margen_amarillo_min then
    insert into public.cocina_config_historial (campo, valor_anterior, valor_nuevo, changed_by)
    values ('margen_amarillo_min', old.margen_amarillo_min, new.margen_amarillo_min, auth.uid());
  end if;
  if old.iva_porc is distinct from new.iva_porc then
    insert into public.cocina_config_historial (campo, valor_anterior, valor_nuevo, changed_by)
    values ('iva_porc', old.iva_porc, new.iva_porc, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists cfg_log_change on public.cocina_config;
create trigger cfg_log_change after update on public.cocina_config
  for each row execute function public.log_cocina_config_change();
