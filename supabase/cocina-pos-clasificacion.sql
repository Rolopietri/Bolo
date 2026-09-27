-- Cocina · POS: tabla base de clasificación de ítems del POS (Xetux)
--
-- NOTA: esta tabla existía en producción pero su CREATE nunca quedó en el repo
-- (los archivos `cocina-pos-*.sql` solo le AGREGAN columnas). Este archivo la
-- crea con sus columnas base, para que la base se pueda reconstruir desde cero.
-- Las columnas extra (insumo_id, extra_receta_id, swap_*, etc.) las agregan los
-- `cocina-pos-*.sql`.

create table if not exists public.pos_clasificacion (
  id uuid primary key default gen_random_uuid(),
  -- nombre normalizado del ítem del POS (clave de match). Único: upsert por él.
  nombre_norm text not null unique,
  nombre_original text not null,
  tipo text not null default 'sin_clasificar',
  receta_id uuid references public.recetas(id) on delete set null,
  proveedor_id uuid references public.proveedores(id) on delete set null,
  porcentaje_acuerdo numeric(6, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pos_clasificacion enable row level security;

drop policy if exists "pos_clasificacion_select_authenticated" on public.pos_clasificacion;
create policy "pos_clasificacion_select_authenticated"
  on public.pos_clasificacion for select to authenticated using (true);
drop policy if exists "pos_clasificacion_insert_authenticated" on public.pos_clasificacion;
create policy "pos_clasificacion_insert_authenticated"
  on public.pos_clasificacion for insert to authenticated with check (true);
drop policy if exists "pos_clasificacion_update_authenticated" on public.pos_clasificacion;
create policy "pos_clasificacion_update_authenticated"
  on public.pos_clasificacion for update to authenticated using (true) with check (true);
drop policy if exists "pos_clasificacion_delete_authenticated" on public.pos_clasificacion;
create policy "pos_clasificacion_delete_authenticated"
  on public.pos_clasificacion for delete to authenticated using (true);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists pos_clasificacion_set_updated_at on public.pos_clasificacion;
create trigger pos_clasificacion_set_updated_at
  before update on public.pos_clasificacion
  for each row execute function public.set_updated_at();
