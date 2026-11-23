-- Cocina · ¿Recuperas el IVA de las compras?
-- ─────────────────────────────────────────────────────────────────
-- Ajuste del negocio (cocina_config, la misma fila de rentabilidad):
--   recupera_iva_compras = true  → el costo del insumo queda SIN IVA
--     (contribuyente ordinario; es el valor por defecto).
--   recupera_iva_compras = false → el costo queda CON IVA.
--
-- La compra siempre guarda el desglose fiscal (base, IVA, exento), en USD.
-- precio_total_usd sigue siendo lo pagado (base + IVA + exento), para los
-- reportes de caja. El costo que pasa a precio_compra_usd / precio_base_usd
-- es costo_usd, calculado al insertar con el ajuste de ESE momento.
--
-- No reescribe precios ya guardados. Las compras anteriores no tienen
-- desglose: el trigger sigue usando precio_total_usd, como hasta hoy.
-- A partir de la próxima compra, el precio del insumo sale con la regla nueva.
--
-- Idempotente. Correr este archivo una vez, antes de desplegar la app.
--
-- Si más adelante se quiere rehacer el costo de insumos cuya compra más
-- reciente YA tiene desglose (no las anteriores a este cambio), el bloque
-- comentado al final es el procedimiento. No se ejecuta solo.

alter table public.cocina_config
  add column if not exists recupera_iva_compras boolean not null default true;

alter table public.compras
  add column if not exists base_usd numeric(15, 4),
  add column if not exists iva_usd numeric(15, 4),
  add column if not exists exento_usd numeric(15, 4),
  add column if not exists costo_usd numeric(15, 4);

comment on column public.cocina_config.recupera_iva_compras is
  'true: el costo del insumo no incluye el IVA de la compra (se recupera). false: el IVA entra en el costo.';
comment on column public.compras.base_usd is 'Gravable sin IVA, en USD.';
comment on column public.compras.iva_usd is 'IVA de la base, en USD. No entra al costo si el negocio lo recupera.';
comment on column public.compras.exento_usd is 'Monto exento de IVA, en USD. Siempre entra al costo.';
comment on column public.compras.costo_usd is
  'Costo que pasa al insumo: base+exento si recupera el IVA, o base+IVA+exento si no. Null en compras anteriores a este cambio.';

-- El historial de cocina_config guarda números. Este sí/no se anota como 1 o 0.
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
  if old.recupera_iva_compras is distinct from new.recupera_iva_compras then
    insert into public.cocina_config_historial (campo, valor_anterior, valor_nuevo, changed_by)
    values (
      'recupera_iva_compras',
      case when old.recupera_iva_compras then 1 else 0 end,
      case when new.recupera_iva_compras then 1 else 0 end,
      auth.uid()
    );
  end if;
  return new;
end;
$$;

-- Al insertar, congela el costo según el ajuste de ese momento.
-- Una compra sin desglose (las de antes, o un pedido sugerido) no se toca:
-- costo_usd queda null y el precio sigue saliendo de precio_total_usd.
create or replace function public.compras_fijar_costo_iva()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_recupera boolean;
begin
  if new.base_usd is null and new.iva_usd is null and new.exento_usd is null then
    return new;
  end if;
  select recupera_iva_compras into v_recupera
    from public.cocina_config where id = 1;
  if v_recupera is null then
    v_recupera := true;
  end if;
  if v_recupera then
    new.costo_usd := coalesce(new.base_usd, 0) + coalesce(new.exento_usd, 0);
  else
    new.costo_usd := coalesce(new.base_usd, 0) + coalesce(new.iva_usd, 0) + coalesce(new.exento_usd, 0);
  end if;
  return new;
end;
$$;

drop trigger if exists compras_fijar_costo_iva on public.compras;
create trigger compras_fijar_costo_iva
  before insert on public.compras
  for each row execute function public.compras_fijar_costo_iva();

-- Misma lógica que cocina-precio-frescura.sql, con dos diferencias:
--   • el precio del insumo sale de costo_usd si la compra lo trae;
--   • declara el motivo del libro de stock (bolo-04), porque CREATE OR REPLACE
--     borra el set_config que esa migración inyectaba.
create or replace function public.apply_compra_to_insumo()
returns trigger language plpgsql as $$
declare
  v_unidad_base text;
  v_cantidad_por_compra numeric;
  v_stock_add numeric;
  v_precio_compra_unit numeric;
  v_monto numeric;
begin
  perform set_config('bolo.motivo', 'compra', true);

  select unidad_base, cantidad_por_compra into v_unidad_base, v_cantidad_por_compra
  from public.insumos where id = new.insumo_id;

  v_stock_add := new.cantidad * coalesce(v_cantidad_por_compra, 1);

  v_monto := coalesce(new.costo_usd, new.precio_total_usd);
  if new.cantidad > 0 then
    v_precio_compra_unit := v_monto / new.cantidad;
  else
    v_precio_compra_unit := v_monto;
  end if;

  update public.insumos set
    stock_actual = coalesce(stock_actual, 0) + v_stock_add,

    penultima_fecha = ultima_fecha,
    penultima_cantidad = ultima_cantidad,
    penultima_precio_usd = ultima_precio_usd,
    penultima_precio_bs = ultima_precio_bs,

    ultima_fecha = new.fecha,
    ultima_cantidad = new.cantidad,
    ultima_precio_usd = v_precio_compra_unit,
    ultima_precio_bs = case
      when new.cantidad > 0 and new.precio_total_bs is not null
        then new.precio_total_bs / new.cantidad
      else null
    end,

    precio_compra_usd = v_precio_compra_unit,
    precio_base_usd = case
      when v_cantidad_por_compra > 0 then v_precio_compra_unit / v_cantidad_por_compra
      else v_precio_compra_unit
    end,
    precio_actualizado = new.fecha,

    proveedor_id = coalesce(new.proveedor_id, proveedor_id)
  where id = new.insumo_id;

  return new;
end;
$$;

drop trigger if exists compra_apply_to_insumo on public.compras;
create trigger compra_apply_to_insumo
  after insert on public.compras
  for each row execute function public.apply_compra_to_insumo();

-- Al borrar, el precio que vuelve es el de la compra que sigue viva,
-- también con su costo_usd si lo tiene (si no, precio_total_usd).
create or replace function public.revertir_compra_de_insumo()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_factor_vivo numeric;
  v_stock_sub numeric;
  v_ult public.compras%rowtype;
  v_pen public.compras%rowtype;
  v_hay_ult boolean := false;
  v_hay_pen boolean := false;
  v_factor numeric;
  v_ult_unit numeric;
  v_pen_unit numeric;
  v_ult_monto numeric;
  v_pen_monto numeric;
begin
  perform set_config('bolo.motivo', 'compra_revertida', true);

  select cantidad_por_compra into v_factor_vivo
    from public.insumos where id = old.insumo_id;

  v_stock_sub := old.cantidad
    * coalesce(old.cantidad_por_compra_snap, v_factor_vivo, 1);

  select * into v_ult
    from public.compras c
   where c.insumo_id = old.insumo_id
   order by c.fecha desc, c.created_at desc, c.id desc
   limit 1;
  v_hay_ult := found;

  if v_hay_ult then
    select * into v_pen
      from public.compras c
     where c.insumo_id = old.insumo_id
       and c.id <> v_ult.id
     order by c.fecha desc, c.created_at desc, c.id desc
     limit 1;
    v_hay_pen := found;
  end if;

  if not v_hay_ult then
    update public.insumos set
      stock_actual = greatest(0, coalesce(stock_actual, 0) - v_stock_sub),
      ultima_fecha = null,
      ultima_cantidad = null,
      ultima_precio_usd = null,
      ultima_precio_bs = null,
      precio_compra_usd = null,
      precio_base_usd = null,
      precio_actualizado = null,
      penultima_fecha = null,
      penultima_cantidad = null,
      penultima_precio_usd = null,
      penultima_precio_bs = null
    where id = old.insumo_id;
  else
    v_factor := coalesce(v_ult.cantidad_por_compra_snap, v_factor_vivo, 1);
    v_ult_monto := coalesce(v_ult.costo_usd, v_ult.precio_total_usd);
    v_ult_unit := case
      when v_ult.cantidad > 0 then v_ult_monto / v_ult.cantidad
      else v_ult_monto
    end;
    if v_hay_pen then
      v_pen_monto := coalesce(v_pen.costo_usd, v_pen.precio_total_usd);
      v_pen_unit := case
        when v_pen.cantidad > 0 then v_pen_monto / v_pen.cantidad
        else v_pen_monto
      end;
    end if;

    update public.insumos set
      stock_actual = greatest(0, coalesce(stock_actual, 0) - v_stock_sub),
      ultima_fecha = v_ult.fecha,
      ultima_cantidad = v_ult.cantidad,
      ultima_precio_usd = v_ult_unit,
      ultima_precio_bs = case
        when v_ult.cantidad > 0 and v_ult.precio_total_bs is not null
          then v_ult.precio_total_bs / v_ult.cantidad
        else null
      end,
      precio_compra_usd = v_ult_unit,
      precio_base_usd = case
        when v_factor > 0 then v_ult_unit / v_factor
        else v_ult_unit
      end,
      precio_actualizado = v_ult.fecha,
      penultima_fecha = case when v_hay_pen then v_pen.fecha else null end,
      penultima_cantidad = case when v_hay_pen then v_pen.cantidad else null end,
      penultima_precio_usd = case when v_hay_pen then v_pen_unit else null end,
      penultima_precio_bs = case
        when not v_hay_pen then null
        when v_pen.cantidad > 0 and v_pen.precio_total_bs is not null
          then v_pen.precio_total_bs / v_pen.cantidad
        else null
      end
    where id = old.insumo_id;
  end if;

  return old;
end;
$$;

drop trigger if exists compra_revert_from_insumo on public.compras;
create trigger compra_revert_from_insumo
  after delete on public.compras
  for each row execute function public.revertir_compra_de_insumo();

notify pgrst, 'reload schema';

-- ── Recalcular después, solo si se pide ──────────────────────────
-- No corre solo. Reescribe costo_usd de las compras que YA tienen desglose
-- con el ajuste actual, y el precio de los insumos cuya compra más reciente
-- es una de esas. No mueve stock. Las compras sin desglose no entran.
--
-- update public.compras c
--    set costo_usd = case
--      when coalesce((select recupera_iva_compras from public.cocina_config where id = 1), true)
--        then coalesce(c.base_usd, 0) + coalesce(c.exento_usd, 0)
--      else coalesce(c.base_usd, 0) + coalesce(c.iva_usd, 0) + coalesce(c.exento_usd, 0)
--    end
--  where c.base_usd is not null or c.iva_usd is not null or c.exento_usd is not null;
--
-- update public.insumos i
--    set precio_compra_usd = u.unit,
--        ultima_precio_usd = u.unit,
--        precio_base_usd = case when u.factor > 0 then u.unit / u.factor else u.unit end,
--        precio_actualizado = u.fecha
--   from (
--     select distinct on (c.insumo_id)
--            c.insumo_id,
--            c.fecha,
--            case when c.cantidad > 0 then c.costo_usd / c.cantidad else c.costo_usd end as unit,
--            coalesce(c.cantidad_por_compra_snap, i2.cantidad_por_compra, 1) as factor
--       from public.compras c
--       join public.insumos i2 on i2.id = c.insumo_id
--      where c.costo_usd is not null
--        and c.id = (
--          select c2.id from public.compras c2
--           where c2.insumo_id = c.insumo_id
--           order by c2.fecha desc, c2.created_at desc, c2.id desc
--           limit 1
--        )
--      order by c.insumo_id
--   ) u
--  where i.id = u.insumo_id;
