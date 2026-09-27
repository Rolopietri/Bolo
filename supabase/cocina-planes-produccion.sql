-- Cocina · M5 Planes de producción
-- Permite reservar stock por adelantado para producciones planificadas.
--
-- Flujo:
--   1. Usuario crea plan (receta + raciones + fecha objetivo)
--   2. Sistema calcula ingredientes (con expansión de subrecetas) en TS y
--      llama a create_plan_produccion con los compromisos pre-calculados
--   3. RPC inserta plan + compromisos + suma stock_comprometido + registra
--      movimientos 'comprometido_in' atomicamente
--   4. Cuando se "completa" el plan → baja stock_total + libera comprometido
--   5. Cuando se "cancela" → solo libera comprometido (no afecta total)
--   6. Al borrar un plan pendiente → libera automáticamente
--
-- Aditivo, idempotente.

-- ════════════════════════════════════════════════════════════════
-- 1. HEADER del plan
-- ════════════════════════════════════════════════════════════════
create table if not exists public.cocina_planes_produccion (
  id uuid primary key default gen_random_uuid(),
  receta_id uuid not null references public.recetas(id) on delete restrict,
  receta_nombre text not null,      -- snapshot por si se borra la receta
  raciones numeric(10, 2) not null,
  fecha_objetivo date,
  nota text,
  estado text not null default 'pendiente',  -- pendiente | completado | cancelado
  completado_at timestamptz,
  cancelado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_planes_estado on public.cocina_planes_produccion(estado);
create index if not exists idx_planes_fecha on public.cocina_planes_produccion(fecha_objetivo);

alter table public.cocina_planes_produccion enable row level security;

drop policy if exists "pln_select" on public.cocina_planes_produccion;
create policy "pln_select" on public.cocina_planes_produccion
  for select to authenticated using (true);
drop policy if exists "pln_insert" on public.cocina_planes_produccion;
create policy "pln_insert" on public.cocina_planes_produccion
  for insert to authenticated with check (true);
drop policy if exists "pln_update" on public.cocina_planes_produccion;
create policy "pln_update" on public.cocina_planes_produccion
  for update to authenticated using (true) with check (true);
drop policy if exists "pln_delete" on public.cocina_planes_produccion;
create policy "pln_delete" on public.cocina_planes_produccion
  for delete to authenticated using (true);

drop trigger if exists pln_set_updated on public.cocina_planes_produccion;
create trigger pln_set_updated before update on public.cocina_planes_produccion
  for each row execute function public.set_updated_at();

-- ════════════════════════════════════════════════════════════════
-- 2. COMPROMISOS (insumos reservados por el plan)
-- ════════════════════════════════════════════════════════════════
create table if not exists public.cocina_plan_compromisos (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.cocina_planes_produccion(id) on delete cascade,
  insumo_id uuid not null references public.insumos(id) on delete restrict,
  cantidad numeric(12, 4) not null,  -- en unidad_base del insumo
  unidad_base text not null           -- snapshot
);

create index if not exists idx_pln_comp_plan on public.cocina_plan_compromisos(plan_id);
create index if not exists idx_pln_comp_insumo on public.cocina_plan_compromisos(insumo_id);

alter table public.cocina_plan_compromisos enable row level security;

drop policy if exists "plc_select" on public.cocina_plan_compromisos;
create policy "plc_select" on public.cocina_plan_compromisos
  for select to authenticated using (true);
drop policy if exists "plc_insert" on public.cocina_plan_compromisos;
create policy "plc_insert" on public.cocina_plan_compromisos
  for insert to authenticated with check (true);
drop policy if exists "plc_update" on public.cocina_plan_compromisos;
create policy "plc_update" on public.cocina_plan_compromisos
  for update to authenticated using (true) with check (true);
drop policy if exists "plc_delete" on public.cocina_plan_compromisos;
create policy "plc_delete" on public.cocina_plan_compromisos
  for delete to authenticated using (true);

-- ════════════════════════════════════════════════════════════════
-- 3. RPC: create_plan_produccion
-- ════════════════════════════════════════════════════════════════
-- Recibe compromisos pre-calculados desde TS (ya con conversión de unidades).
-- p_compromisos JSONB: [{"insumo_id": "uuid", "cantidad": 123.45, "unidad_base": "g"}, ...]
create or replace function public.create_plan_produccion(
  p_receta_id uuid,
  p_receta_nombre text,
  p_raciones numeric,
  p_fecha_objetivo date,
  p_nota text,
  p_compromisos jsonb
) returns uuid
language plpgsql
security invoker
as $$
declare
  v_plan_id uuid;
  v_item jsonb;
  v_insumo_id uuid;
  v_cant numeric;
  v_unidad text;
begin
  -- Insertar header
  insert into public.cocina_planes_produccion
    (receta_id, receta_nombre, raciones, fecha_objetivo, nota)
  values
    (p_receta_id, p_receta_nombre, p_raciones, p_fecha_objetivo,
     nullif(trim(coalesce(p_nota, '')), ''))
  returning id into v_plan_id;

  -- Por cada compromiso: insertar línea + sumar stock_comprometido + registrar movimiento
  for v_item in select * from jsonb_array_elements(p_compromisos)
  loop
    v_insumo_id := (v_item->>'insumo_id')::uuid;
    v_cant := (v_item->>'cantidad')::numeric;
    v_unidad := v_item->>'unidad_base';

    if v_cant <= 0 then continue; end if;

    insert into public.cocina_plan_compromisos
      (plan_id, insumo_id, cantidad, unidad_base)
    values (v_plan_id, v_insumo_id, v_cant, v_unidad);

    update public.insumos
       set stock_comprometido = coalesce(stock_comprometido, 0) + v_cant
     where id = v_insumo_id;

    insert into public.stock_movimientos
      (insumo_id, tipo, capa, cantidad, motivo, fecha, nota)
    values
      (v_insumo_id, 'comprometido_in', 'comprometido', v_cant,
       'Plan: ' || p_receta_nombre, current_date,
       'Plan ' || v_plan_id::text);
  end loop;

  return v_plan_id;
end;
$$;

-- ════════════════════════════════════════════════════════════════
-- 4. y 5. RPC: completar_plan_produccion / cancelar_plan_produccion
--     →  MOVIDAS (A5, dedupe) — ver definiciones canónicas abajo
-- ════════════════════════════════════════════════════════════════
-- Definiciones canónicas (las que corren en la base):
--   • completar_plan_produccion → cocina-planes-fix-completar.sql
--       Solo cambia el estado a 'completado'. NO toca el stock: el ingrediente
--       sigue comprometido hasta venderse o perderse. (La venta descuenta el
--       crudo del total.)
--   • cancelar_plan_produccion  → cocina-planes-venta-libera.sql
--       Libera la FRACCIÓN no vendida del comprometido.
--
-- Las versiones que vivían aquí eran las VIEJAS y erróneas, y se eliminaron
-- para que no pisen a las buenas al reaplicar el repo:
--   - completar descontaba stock_actual al completar → doble descuento (la
--     venta vuelve a restar el crudo).
--   - cancelar liberaba la cantidad COMPLETA (sin fracción) → restaba de más.

-- ════════════════════════════════════════════════════════════════
-- 6. RPC: delete_plan_produccion  →  MOVIDA (A5, dedupe)
-- ════════════════════════════════════════════════════════════════
-- La definición canónica de delete_plan_produccion vive en
-- cocina-planes-venta-libera.sql: libera la FRACCIÓN no vendida del comprometido
-- (pendiente O completado) antes de borrar. La versión que estaba aquí solo
-- liberaba si el plan estaba 'pendiente' — dejaba comprometido colgado al borrar
-- un completado. Se eliminó para no pisar la buena.
