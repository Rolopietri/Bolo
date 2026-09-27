-- Fase 4 — M5 Inventario, ventas y pedidos
-- Cierra el ciclo: venta → descuenta stock automáticamente.

-- 1) Alias de Xetux en recetas (para matchear con el export del POS)
alter table public.recetas
  add column if not exists xetux_nombre text;
create index if not exists idx_recetas_xetux_nombre on public.recetas(xetux_nombre);

-- 2) VENTAS — cada línea representa unidades vendidas de una receta
create table if not exists public.ventas (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  receta_id uuid references public.recetas(id) on delete set null,
  receta_nombre text not null,
  cantidad numeric(12, 4) not null,
  precio_unitario_usd numeric(10, 4),
  total_usd numeric(12, 4),
  fuente text not null default 'manual',  -- 'manual' | 'xetux_csv' | 'xetux_api'
  batch_id uuid,                            -- agrupa import del mismo cierre diario
  notas text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_ventas_fecha on public.ventas(fecha desc);
create index if not exists idx_ventas_receta on public.ventas(receta_id, fecha desc);
create index if not exists idx_ventas_batch on public.ventas(batch_id);

alter table public.ventas enable row level security;

drop policy if exists "ventas_select" on public.ventas;
create policy "ventas_select" on public.ventas
  for select to authenticated using (true);
drop policy if exists "ventas_insert" on public.ventas;
create policy "ventas_insert" on public.ventas
  for insert to authenticated with check (true);
drop policy if exists "ventas_update" on public.ventas;
create policy "ventas_update" on public.ventas
  for update to authenticated using (true) with check (true);
drop policy if exists "ventas_delete" on public.ventas;
create policy "ventas_delete" on public.ventas
  for delete to authenticated using (true);

-- 3) Trigger: al insertar venta, descontar stock de cada ingrediente
-- Factor = cantidad_vendida / porciones_de_la_receta
-- (si receta rinde 5 porciones y se vendieron 10 unidades, factor = 2,
--  se descuenta 2× la cantidad de cada ingrediente)
create or replace function public.descontar_stock_por_venta()
returns trigger language plpgsql as $$
declare
  r record;
  porciones_receta int;
  factor numeric;
begin
  if new.receta_id is null then return new; end if;

  select porciones into porciones_receta
  from public.recetas where id = new.receta_id;

  if porciones_receta is null or porciones_receta = 0 then return new; end if;

  factor := new.cantidad / porciones_receta::numeric;

  for r in (
    select ri.insumo_id, ri.cantidad
    from public.receta_ingredientes ri
    where ri.receta_id = new.receta_id and ri.insumo_id is not null
  ) loop
    update public.insumos
    set stock_actual = greatest(0, stock_actual - (r.cantidad * factor))
    where id = r.insumo_id;
  end loop;

  return new;
end;
$$;

drop trigger if exists venta_decrement_stock on public.ventas;
create trigger venta_decrement_stock
  after insert on public.ventas
  for each row execute function public.descontar_stock_por_venta();

-- 4) Si se elimina una venta, devolver el stock (compensación inversa)
create or replace function public.revertir_stock_por_venta()
returns trigger language plpgsql as $$
declare
  r record;
  porciones_receta int;
  factor numeric;
begin
  if old.receta_id is null then return old; end if;
  select porciones into porciones_receta from public.recetas where id = old.receta_id;
  if porciones_receta is null or porciones_receta = 0 then return old; end if;
  factor := old.cantidad / porciones_receta::numeric;
  for r in (
    select ri.insumo_id, ri.cantidad
    from public.receta_ingredientes ri
    where ri.receta_id = old.receta_id and ri.insumo_id is not null
  ) loop
    update public.insumos
    set stock_actual = stock_actual + (r.cantidad * factor)
    where id = r.insumo_id;
  end loop;
  return old;
end;
$$;

drop trigger if exists venta_revert_stock on public.ventas;
create trigger venta_revert_stock
  after delete on public.ventas
  for each row execute function public.revertir_stock_por_venta();
