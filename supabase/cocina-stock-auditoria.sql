-- Cocina · Auditoría de stock (M5 — trazabilidad total del inventario)
--
-- Registra AUTOMÁTICAMENTE cada cambio del stock de un insumo, sin importar
-- por dónde entre el cambio: el formulario de insumos, una compra, una venta
-- del POS, un plan de producción, una pérdida/merma… o una edición directa
-- desde el editor SQL de Supabase.
--
-- El disparador vive en la base de datos (no en la app), así que NADA se le
-- escapa. Es la red de seguridad que faltó cuando se pusieron 7 insumos en
-- cero sin dejar rastro: aquí habría quedado registrado el antes, el después,
-- el momento exacto y si vino de la app (usuario) o de un cambio directo.
--
-- Aditivo e idempotente — corre seguro varias veces.

create table if not exists public.stock_auditoria (
  id uuid primary key default gen_random_uuid(),

  -- Insumo afectado. on delete set null: si el insumo se borra, el historial
  -- sobrevive (por eso guardamos también el nombre y la unidad como snapshot).
  insumo_id uuid references public.insumos(id) on delete set null,
  insumo_nombre text not null,
  unidad_base text,

  -- Capa física (stock_actual). anterior = null cuando es un alta.
  stock_anterior numeric(14, 4),
  stock_nuevo numeric(14, 4),

  -- Capa reservada (stock_comprometido).
  comprometido_anterior numeric(14, 4),
  comprometido_nuevo numeric(14, 4),

  -- De dónde vino el cambio:
  --   'alta'    → se creó el insumo con stock inicial
  --   'app'     → cambio hecho por un usuario logueado (tiene auth.uid())
  --   'directo' → cambio SIN usuario: editor SQL de Supabase o service_role.
  --               ESTOS son los que hay que mirar con lupa.
  origen text not null default 'directo',

  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);

create index if not exists idx_saud_insumo on public.stock_auditoria(insumo_id);
create index if not exists idx_saud_changed on public.stock_auditoria(changed_at desc);
create index if not exists idx_saud_origen on public.stock_auditoria(origen);

alter table public.stock_auditoria enable row level security;

drop policy if exists "saud_select" on public.stock_auditoria;
create policy "saud_select" on public.stock_auditoria
  for select to authenticated using (true);

-- El disparador corre como el rol que hace el UPDATE (authenticated), así que
-- necesita permiso de insert. Los cambios directos desde el editor SQL corren
-- como postgres/service_role y saltan RLS, así que también quedan registrados.
drop policy if exists "saud_insert" on public.stock_auditoria;
create policy "saud_insert" on public.stock_auditoria
  for insert to authenticated with check (true);

-- ─── Disparador ────────────────────────────────────────────────────
create or replace function public.log_stock_auditoria()
returns trigger language plpgsql as $$
declare
  v_actor uuid := auth.uid();
begin
  if (tg_op = 'INSERT') then
    -- Solo registramos el alta si nace con algo de stock.
    if coalesce(new.stock_actual, 0) <> 0
       or coalesce(new.stock_comprometido, 0) <> 0 then
      insert into public.stock_auditoria (
        insumo_id, insumo_nombre, unidad_base,
        stock_anterior, stock_nuevo,
        comprometido_anterior, comprometido_nuevo,
        origen, changed_by
      ) values (
        new.id, new.nombre, new.unidad_base,
        null, new.stock_actual,
        null, new.stock_comprometido,
        'alta', v_actor
      );
    end if;
    return new;
  end if;

  -- UPDATE: registrar solo si cambió alguna de las dos capas de stock.
  if new.stock_actual is distinct from old.stock_actual
     or coalesce(new.stock_comprometido, 0)
        is distinct from coalesce(old.stock_comprometido, 0) then
    insert into public.stock_auditoria (
      insumo_id, insumo_nombre, unidad_base,
      stock_anterior, stock_nuevo,
      comprometido_anterior, comprometido_nuevo,
      origen, changed_by
    ) values (
      new.id, new.nombre, new.unidad_base,
      old.stock_actual, new.stock_actual,
      old.stock_comprometido, new.stock_comprometido,
      case when v_actor is not null then 'app' else 'directo' end,
      v_actor
    );
  end if;

  return new;
end;
$$;

drop trigger if exists insumos_log_stock on public.insumos;
create trigger insumos_log_stock
  after insert or update on public.insumos
  for each row execute function public.log_stock_auditoria();
