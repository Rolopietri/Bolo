-- Cocina · Historial de procesamientos (Fase E — alertas de merma)
-- ════════════════════════════════════════════════════════════════════
-- Cada evento de procesamiento (B) guarda, además del movimiento de merma, una
-- fila estructurada aquí: crudo que entró, procesado que salió y la merma %. Eso
-- permite a la Fase E detectar desviación puntual y deriva contra el estándar.
-- Aditivo, con RLS (mismo patrón que stock_movimientos). Idempotente.

create table if not exists public.procesamientos (
  id uuid primary key default gen_random_uuid(),
  insumo_id uuid not null references public.insumos(id) on delete cascade,
  fecha date not null default current_date,
  crudo numeric not null,          -- crudo consumido (unidad base)
  procesado numeric not null,      -- procesado obtenido (unidad base)
  merma_porc numeric not null,     -- (crudo − procesado) / crudo × 100
  nota text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_procesamientos_insumo_fecha
  on public.procesamientos (insumo_id, fecha desc, created_at desc);

alter table public.procesamientos enable row level security;

drop policy if exists "proc_select" on public.procesamientos;
create policy "proc_select" on public.procesamientos
  for select to authenticated using (true);

drop policy if exists "proc_insert" on public.procesamientos;
create policy "proc_insert" on public.procesamientos
  for insert to authenticated with check (true);

drop policy if exists "proc_delete" on public.procesamientos;
create policy "proc_delete" on public.procesamientos
  for delete to authenticated using (true);

-- Reemplaza registrar_procesamiento para que ADEMÁS registre la fila de
-- historial. Mismo contrato de retorno (no cambia el cliente).
create or replace function public.registrar_procesamiento(
  p_insumo_id uuid,
  p_crudo numeric,
  p_procesado numeric,
  p_fecha date default null,
  p_nota text default null
)
returns table (
  insumo_id uuid,
  stock_crudo numeric,
  stock_procesado numeric,
  merma numeric,
  movimiento_id uuid
)
language plpgsql
security invoker
set search_path = public
as $$
-- `stock_procesado` es a la vez columna de la tabla y nombre de salida de la
-- función; sin esto, el UPDATE/RETURNING da "column reference is ambiguous".
#variable_conflict use_column
declare
  v_crudo_nuevo numeric;
  v_proc_nuevo  numeric;
  v_merma       numeric;
  v_mov_id      uuid;
  v_crudo_actual numeric;
begin
  if p_crudo is null or p_crudo <= 0 then
    raise exception 'El crudo procesado debe ser mayor a 0.';
  end if;
  if p_procesado is null or p_procesado < 0 then
    raise exception 'El procesado obtenido no puede ser negativo.';
  end if;

  select coalesce(stock_actual, 0) into v_crudo_actual
    from public.insumos where id = p_insumo_id for update;
  if not found then
    raise exception 'Insumo no encontrado';
  end if;
  if p_crudo > v_crudo_actual + 0.00005 then
    raise exception 'No hay suficiente crudo: tienes % y quieres procesar %.',
      v_crudo_actual, p_crudo;
  end if;

  v_merma := p_crudo - p_procesado;

  update public.insumos
     set stock_actual     = greatest(0, coalesce(stock_actual, 0) - p_crudo),
         stock_procesado  = coalesce(stock_procesado, 0) + p_procesado
   where id = p_insumo_id
   returning stock_actual, stock_procesado into v_crudo_nuevo, v_proc_nuevo;

  if v_merma <> 0 then
    insert into public.stock_movimientos
      (insumo_id, tipo, capa, cantidad, motivo, fecha, nota)
    values
      (p_insumo_id, 'merma', 'total', -v_merma, 'Procesamiento',
       coalesce(p_fecha, current_date), p_nota)
    returning id into v_mov_id;
  end if;

  -- Historial estructurado para las alertas de merma (Fase E).
  insert into public.procesamientos (insumo_id, fecha, crudo, procesado, merma_porc, nota, created_by)
  values (
    p_insumo_id, coalesce(p_fecha, current_date), p_crudo, p_procesado,
    case when p_crudo > 0 then (p_crudo - p_procesado) / p_crudo * 100 else 0 end,
    p_nota, auth.uid()
  );

  return query select p_insumo_id, v_crudo_nuevo, v_proc_nuevo, v_merma, v_mov_id;
end;
$$;
