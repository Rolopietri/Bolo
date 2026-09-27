-- Cocina · Pedidos guardados
-- Permite guardar un pedido sugerido (con sus recetas y raciones) para
-- recuperarlo después, marcarlo como comprado, o usarlo como recordatorio
-- de qué hay que preparar para una fecha específica.
--
-- Aditivo, idempotente — se puede correr varias veces sin romper nada.

-- ════════════════════════════════════════════════════════════════
-- 1. HEADER: cabecera del pedido
-- ════════════════════════════════════════════════════════════════
create table if not exists public.cocina_pedidos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,                     -- ej "Pedido evento 28 may"
  fecha_necesaria date,                     -- fecha objetivo del pedido
  nota text,
  estado text not null default 'pendiente', -- pendiente | comprado | cancelado
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_cocina_pedidos_fecha
  on public.cocina_pedidos(fecha_necesaria);
create index if not exists idx_cocina_pedidos_estado
  on public.cocina_pedidos(estado);

alter table public.cocina_pedidos enable row level security;

drop policy if exists "cp_select" on public.cocina_pedidos;
create policy "cp_select" on public.cocina_pedidos
  for select to authenticated using (true);
drop policy if exists "cp_insert" on public.cocina_pedidos;
create policy "cp_insert" on public.cocina_pedidos
  for insert to authenticated with check (true);
drop policy if exists "cp_update" on public.cocina_pedidos;
create policy "cp_update" on public.cocina_pedidos
  for update to authenticated using (true) with check (true);
drop policy if exists "cp_delete" on public.cocina_pedidos;
create policy "cp_delete" on public.cocina_pedidos
  for delete to authenticated using (true);

drop trigger if exists cp_set_updated on public.cocina_pedidos;
create trigger cp_set_updated
  before update on public.cocina_pedidos
  for each row execute function public.set_updated_at();

-- ════════════════════════════════════════════════════════════════
-- 2. LÍNEAS: las recetas + raciones del pedido (objetivos)
-- ════════════════════════════════════════════════════════════════
-- on delete set null en receta_id: si se borra una receta del catálogo,
-- no perdemos el pedido entero; queda como línea huérfana con receta_nombre.
create table if not exists public.cocina_pedidos_recetas (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.cocina_pedidos(id) on delete cascade,
  receta_id uuid references public.recetas(id) on delete set null,
  receta_nombre text not null,              -- snapshot del nombre al guardar
  raciones numeric(10, 2) not null default 0,
  orden int not null default 0
);

create index if not exists idx_cp_recetas_pedido
  on public.cocina_pedidos_recetas(pedido_id);

alter table public.cocina_pedidos_recetas enable row level security;

drop policy if exists "cpr_select" on public.cocina_pedidos_recetas;
create policy "cpr_select" on public.cocina_pedidos_recetas
  for select to authenticated using (true);
drop policy if exists "cpr_insert" on public.cocina_pedidos_recetas;
create policy "cpr_insert" on public.cocina_pedidos_recetas
  for insert to authenticated with check (true);
drop policy if exists "cpr_update" on public.cocina_pedidos_recetas;
create policy "cpr_update" on public.cocina_pedidos_recetas
  for update to authenticated using (true) with check (true);
drop policy if exists "cpr_delete" on public.cocina_pedidos_recetas;
create policy "cpr_delete" on public.cocina_pedidos_recetas
  for delete to authenticated using (true);
