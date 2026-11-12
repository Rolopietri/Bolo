-- ═══════════════════════════════════════════════════════════════════
-- BOLO-05 · Registro de producción (lotes)
-- ═══════════════════════════════════════════════════════════════════
-- Cada lote es lo que el cocinero tomó de un insumo y lo que le quedó útil
-- tras limpiarlo o procesarlo. El desecho (tomado − útil) da la merma real,
-- que se compara con la merma estándar de la ficha del insumo, y lo útil se
-- compara con lo que las ventas dicen que se usó.
--
-- Por ahora es solo un registro: no mueve el stock.
-- No borra datos. Idempotente: se puede correr más de una vez.

create table if not exists public.produccion_lotes (
  id               uuid primary key default gen_random_uuid(),
  fecha            date not null default current_date,
  insumo_id        uuid not null references public.insumos(id) on delete cascade,
  -- En la unidad base del insumo (g, ml, unidad).
  cantidad_tomada  numeric not null check (cantidad_tomada > 0),
  cantidad_util    numeric not null check (cantidad_util >= 0),
  responsable      text,
  notas            text,
  -- 'manual' (escrito en la app), 'escaneo' (plantilla impresa) o 'telegram'
  -- (mensaje del grupo de producción, aprobado en la app).
  origen           text not null default 'manual' check (origen in ('manual', 'escaneo', 'telegram')),
  created_by       uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  constraint produccion_util_no_supera check (cantidad_util <= cantidad_tomada)
);
create index if not exists produccion_lotes_fecha_idx on public.produccion_lotes (fecha desc);
create index if not exists produccion_lotes_insumo_idx on public.produccion_lotes (insumo_id);

alter table public.produccion_lotes enable row level security;
drop policy if exists prodl_select on public.produccion_lotes;
drop policy if exists prodl_insert on public.produccion_lotes;
drop policy if exists prodl_update on public.produccion_lotes;
drop policy if exists prodl_delete on public.produccion_lotes;
create policy prodl_select on public.produccion_lotes for select to authenticated using (true);
create policy prodl_insert on public.produccion_lotes for insert to authenticated with check (true);
create policy prodl_update on public.produccion_lotes for update to authenticated using (true) with check (true);
create policy prodl_delete on public.produccion_lotes for delete to authenticated using (true);
