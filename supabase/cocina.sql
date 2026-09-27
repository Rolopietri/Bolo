-- Schema Sistema de Cocina — La Quinta Mamá
-- Fase 1: M1 (Materias Primas) + proveedores + compras + tasa BCV
-- Aditivo. No toca las tablas existentes.

-- ============================================================
-- TASAS DE CAMBIO BCV (auto-actualizado por cron diario)
-- ============================================================
create table if not exists public.tasa_bcv (
  fecha date primary key,
  usd_bs numeric(20, 4) not null,
  eur_bs numeric(20, 4),
  paralela_bs numeric(20, 4),
  fuente text default 'bcv',
  created_at timestamptz not null default now()
);

alter table public.tasa_bcv enable row level security;

drop policy if exists "tasa_select" on public.tasa_bcv;
create policy "tasa_select" on public.tasa_bcv
  for select to authenticated using (true);
drop policy if exists "tasa_insert" on public.tasa_bcv;
create policy "tasa_insert" on public.tasa_bcv
  for insert to authenticated with check (true);
drop policy if exists "tasa_update" on public.tasa_bcv;
create policy "tasa_update" on public.tasa_bcv
  for update to authenticated using (true) with check (true);

-- Permitir que el cron diario (sin sesión) escriba la tasa.
-- Sin riesgo: solo la tasa pública oficial del BCV entra acá.
drop policy if exists "tasa_anon_insert" on public.tasa_bcv;
create policy "tasa_anon_insert" on public.tasa_bcv
  for insert to anon with check (true);
drop policy if exists "tasa_anon_update" on public.tasa_bcv;
create policy "tasa_anon_update" on public.tasa_bcv
  for update to anon using (true) with check (true);
drop policy if exists "tasa_anon_select" on public.tasa_bcv;
create policy "tasa_anon_select" on public.tasa_bcv
  for select to anon using (true);

-- ============================================================
-- PROVEEDORES
-- ============================================================
create table if not exists public.proveedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  contacto_nombre text,
  contacto_telefono text,
  contacto_email text,
  -- Modalidad de pago (multi-select inline)
  acepta_bs_bcv_dolar boolean not null default false,
  acepta_bs_bcv_euro boolean not null default false,
  acepta_bs_paralela boolean not null default false,
  acepta_usd_efectivo boolean not null default false,
  acepta_usd_divisa boolean not null default false,
  notas text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

alter table public.proveedores enable row level security;

drop policy if exists "prov_select" on public.proveedores;
create policy "prov_select" on public.proveedores
  for select to authenticated using (true);
drop policy if exists "prov_insert" on public.proveedores;
create policy "prov_insert" on public.proveedores
  for insert to authenticated with check (true);
drop policy if exists "prov_update" on public.proveedores;
create policy "prov_update" on public.proveedores
  for update to authenticated using (true) with check (true);
drop policy if exists "prov_delete" on public.proveedores;
create policy "prov_delete" on public.proveedores
  for delete to authenticated using (true);

-- ============================================================
-- INSUMOS (materias primas / ingredientes)
-- ============================================================
create table if not exists public.insumos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  categoria text not null default 'otros',
  -- 'cafe', 'lacteos', 'frutas', 'panaderia', 'proteinas', 'salsas',
  -- 'bebidas', 'desechables', 'condimentos', 'snacks', 'otros'

  seccion text not null default 'ambos',  -- 'cafetin' | 'comedor' | 'ambos'

  -- Empaque de compra y unidad base de uso en recetas
  -- ej: compra 1 paquete de 900g, en receta usa gramos
  unidad_compra text not null,           -- 'kg', 'L', 'paq 12 unid', '900g', etc. (texto libre)
  cantidad_por_compra numeric(12, 4) not null default 1,  -- cuántas unidades base trae un empaque
  unidad_base text not null,             -- 'g', 'ml', 'unidad'

  -- Precios en USD (referencia)
  precio_compra_usd numeric(10, 4),      -- precio del empaque de compra
  precio_base_usd numeric(12, 6),        -- precio por unidad base (derivado)
  precio_actualizado date,               -- última confirmación del precio (compra o refresco manual)

  -- Stock
  stock_actual numeric(12, 4) not null default 0,  -- en unidad_base
  stock_minimo numeric(12, 4),                      -- umbral de alerta

  -- Proveedor preferido
  proveedor_id uuid references public.proveedores(id) on delete set null,

  -- Últimas compras (rotativas, las 2 más recientes)
  ultima_fecha date,
  ultima_cantidad numeric(12, 4),
  ultima_precio_usd numeric(10, 4),
  ultima_precio_bs numeric(15, 2),
  penultima_fecha date,
  penultima_cantidad numeric(12, 4),
  penultima_precio_usd numeric(10, 4),
  penultima_precio_bs numeric(15, 2),

  notas text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_insumos_categoria on public.insumos(categoria);
create index if not exists idx_insumos_seccion on public.insumos(seccion);
create index if not exists idx_insumos_proveedor on public.insumos(proveedor_id);

alter table public.insumos enable row level security;

drop policy if exists "ins_select" on public.insumos;
create policy "ins_select" on public.insumos
  for select to authenticated using (true);
drop policy if exists "ins_insert" on public.insumos;
create policy "ins_insert" on public.insumos
  for insert to authenticated with check (true);
drop policy if exists "ins_update" on public.insumos;
create policy "ins_update" on public.insumos
  for update to authenticated using (true) with check (true);
drop policy if exists "ins_delete" on public.insumos;
create policy "ins_delete" on public.insumos
  for delete to authenticated using (true);

-- ============================================================
-- HISTORIAL DE PRECIOS (para Fase 5 — se llena desde día 1)
-- ============================================================
create table if not exists public.insumo_precio_historico (
  id uuid primary key default gen_random_uuid(),
  insumo_id uuid not null references public.insumos(id) on delete cascade,
  fecha timestamptz not null default now(),
  precio_compra_anterior_usd numeric(10, 4),
  precio_compra_nuevo_usd numeric(10, 4) not null,
  proveedor_id uuid references public.proveedores(id) on delete set null,
  motivo text,
  tasa_bcv_usada numeric(20, 4),
  usuario_id uuid references auth.users(id) on delete set null
);

create index if not exists idx_iph_insumo on public.insumo_precio_historico(insumo_id, fecha desc);

alter table public.insumo_precio_historico enable row level security;

drop policy if exists "iph_select" on public.insumo_precio_historico;
create policy "iph_select" on public.insumo_precio_historico
  for select to authenticated using (true);
drop policy if exists "iph_insert" on public.insumo_precio_historico;
create policy "iph_insert" on public.insumo_precio_historico
  for insert to authenticated with check (true);

-- ============================================================
-- COMPRAS (cada compra registrada — actualiza stock + precio)
-- ============================================================
create table if not exists public.compras (
  id uuid primary key default gen_random_uuid(),
  insumo_id uuid not null references public.insumos(id) on delete cascade,
  proveedor_id uuid references public.proveedores(id) on delete set null,
  fecha date not null default current_date,
  cantidad numeric(12, 4) not null,             -- en unidad_compra
  precio_total_usd numeric(15, 4) not null,
  precio_total_bs numeric(15, 2),
  tasa_bcv_usada numeric(20, 4),
  modalidad_pago text,
  -- 'bcv_dolar' | 'bcv_euro' | 'paralela' | 'efectivo' | 'divisa'
  notas text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_compras_insumo on public.compras(insumo_id, fecha desc);
create index if not exists idx_compras_fecha on public.compras(fecha desc);

alter table public.compras enable row level security;

drop policy if exists "comp_select" on public.compras;
create policy "comp_select" on public.compras
  for select to authenticated using (true);
drop policy if exists "comp_insert" on public.compras;
create policy "comp_insert" on public.compras
  for insert to authenticated with check (true);
drop policy if exists "comp_update" on public.compras;
create policy "comp_update" on public.compras
  for update to authenticated using (true) with check (true);
drop policy if exists "comp_delete" on public.compras;
create policy "comp_delete" on public.compras
  for delete to authenticated using (true);

-- ============================================================
-- TRIGGERS
-- ============================================================
drop trigger if exists prov_set_updated on public.proveedores;
create trigger prov_set_updated
  before update on public.proveedores
  for each row execute function public.set_updated_at();

drop trigger if exists ins_set_updated on public.insumos;
create trigger ins_set_updated
  before update on public.insumos
  for each row execute function public.set_updated_at();

-- Trigger: cuando cambia precio_compra_usd en insumos, registrar en historial
create or replace function public.log_insumo_price_change()
returns trigger language plpgsql as $$
begin
  if (TG_OP = 'UPDATE'
      and new.precio_compra_usd is not null
      and (old.precio_compra_usd is null or old.precio_compra_usd <> new.precio_compra_usd)) then
    insert into public.insumo_precio_historico
      (insumo_id, precio_compra_anterior_usd, precio_compra_nuevo_usd, proveedor_id, usuario_id)
    values
      (new.id, old.precio_compra_usd, new.precio_compra_usd, new.proveedor_id, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists ins_price_history on public.insumos;
create trigger ins_price_history
  after update on public.insumos
  for each row execute function public.log_insumo_price_change();

-- Trigger: al registrar una compra, actualizar stock + últimas 2 compras del insumo
create or replace function public.apply_compra_to_insumo()
returns trigger language plpgsql as $$
declare
  v_unidad_base text;
  v_cantidad_por_compra numeric;
  v_stock_add numeric;
  v_precio_compra_unit numeric;
begin
  -- Traer unidad_base y cantidad_por_compra del insumo
  select unidad_base, cantidad_por_compra into v_unidad_base, v_cantidad_por_compra
  from public.insumos where id = new.insumo_id;

  -- Sumar al stock (cantidad comprada × cantidad_por_compra)
  v_stock_add := new.cantidad * coalesce(v_cantidad_por_compra, 1);

  -- Precio unitario de esta compra
  if new.cantidad > 0 then
    v_precio_compra_unit := new.precio_total_usd / new.cantidad;
  else
    v_precio_compra_unit := new.precio_total_usd;
  end if;

  -- Rotar última → penúltima, y registrar nueva
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
    -- El precio queda "fresco" a la fecha de la compra (frescura del costeo)
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

-- ============================================================
-- VIEW: insumos con tasa BCV vigente para conveniencia
-- ============================================================
create or replace view public.v_tasa_bcv_actual as
  select * from public.tasa_bcv order by fecha desc limit 1;

-- ============================================================
-- SEED: proveedores de ejemplo
-- ============================================================
insert into public.proveedores (nombre, contacto_nombre, contacto_telefono, acepta_usd_efectivo, acepta_usd_divisa, acepta_bs_bcv_dolar)
values
  ('Por definir', null, null, true, true, true)
on conflict do nothing;

-- ============================================================
-- SEED: INSUMOS — extraído del Excel "Costos cafetería QM"
-- Precios en USD, cantidades en unidad base
-- Lucía revisa y ajusta lo que esté distinto.
-- ============================================================
insert into public.insumos
  (nombre, categoria, seccion, unidad_compra, cantidad_por_compra, unidad_base,
   precio_compra_usd, precio_base_usd, stock_minimo, notas)
values
  -- CAFÉ Y LÁCTEOS
  ('Café en grano', 'cafe', 'cafetin', 'kg', 1000, 'g', 23.20, 0.02320, 200, null),
  ('Leche completa', 'lacteos', 'ambos', 'L', 1000, 'ml', 3.77, 0.003770, 500, null),
  ('Leche de almendras', 'lacteos', 'ambos', 'L', 1000, 'ml', 5.22, 0.005220, 200, null),
  ('Cacao en polvo', 'cafe', 'cafetin', 'kg', 1000, 'g', 8.56, 0.008560, 100, null),

  -- FRUTAS Y SMOOTHIES
  ('Hielo', 'otros', 'ambos', 'kg', 1000, 'g', 1.20, 0.001200, 2000, null),
  ('Guayaba', 'frutas', 'cafetin', 'kg', 1000, 'g', 5.75, 0.005750, 500, null),
  ('Mango', 'frutas', 'cafetin', 'kg', 1000, 'g', 5.75, 0.005750, 500, 'Precio aprox. — ajustar'),
  ('Agua de coco', 'bebidas', 'cafetin', 'L', 1000, 'ml', 5.75, 0.005750, 1000, null),
  ('Cambur', 'frutas', 'cafetin', 'kg', 1000, 'g', 3.00, 0.003000, 500, 'Precio aprox.'),
  ('Papelón pulverizado', 'otros', 'cafetin', '900g', 900, 'g', 6.43, 0.007144, 200, null),
  ('Pulpa de parchita', 'frutas', 'cafetin', 'kg', 1000, 'g', 7.00, 0.007000, 500, 'Precio aprox.'),
  ('Piña', 'frutas', 'cafetin', 'kg', 1000, 'g', 4.00, 0.004000, 500, 'Precio aprox.'),
  ('Hierbabuena', 'condimentos', 'cafetin', '100g', 100, 'g', 1.50, 0.015000, 50, null),
  ('Espinaca', 'frutas', 'cafetin', 'ramillete', 1, 'unidad', 2.00, 2.000000, 5, null),
  ('Celery', 'frutas', 'cafetin', 'kg', 1000, 'g', 4.50, 0.004500, 200, null),
  ('Aguacate', 'frutas', 'ambos', 'kg', 1000, 'g', 6.00, 0.006000, 500, null),
  ('Jengibre', 'condimentos', 'cafetin', 'kg', 1000, 'g', 12.00, 0.012000, 100, null),
  ('Fresa', 'frutas', 'cafetin', 'kg', 1000, 'g', 8.00, 0.008000, 500, null),
  ('Mora', 'frutas', 'cafetin', 'kg', 1000, 'g', 12.00, 0.012000, 200, null),
  ('Crema de coco', 'lacteos', 'cafetin', '350ml', 350, 'ml', 4.50, 0.012857, 1000, null),
  ('Mantequilla de maní', 'condimentos', 'cafetin', '500g', 500, 'g', 8.00, 0.016000, 200, null),
  ('Jugo de naranja', 'bebidas', 'cafetin', 'galón', 3785, 'ml', 12.00, 0.003171, 3000, null),
  ('Vainilla', 'condimentos', 'cafetin', '250g', 250, 'ml', 8.00, 0.032000, 100, null),
  ('Canela', 'condimentos', 'ambos', '500g', 500, 'g', 6.00, 0.012000, 100, null),

  -- BEBIDAS EMBOTELLADAS
  ('Cerveza (botella)', 'bebidas', 'cafetin', 'paq 36 unid', 36, 'unidad', 19.80, 0.550000, 36, null),
  ('Malta', 'bebidas', 'cafetin', 'paq 24 unid', 24, 'unidad', 20.80, 0.866667, 24, null),
  ('Refresco 7up/Pepsi', 'bebidas', 'cafetin', 'paq 48 unid', 48, 'unidad', 44.00, 0.916667, 48, null),
  ('Rockstar', 'bebidas', 'cafetin', 'paq 24 unid', 24, 'unidad', 21.20, 0.883333, 24, null),
  ('Agua mineral', 'bebidas', 'ambos', 'paq 24 unid', 24, 'unidad', 21.20, 0.883333, 48, null),
  ('Agua con gas', 'bebidas', 'ambos', 'paq 24 unid', 24, 'unidad', 23.40, 0.975000, 24, null),
  ('Lipton', 'bebidas', 'cafetin', 'paq 12 unid', 12, 'unidad', 18.30, 1.525000, 24, null),
  ('Gatorade', 'bebidas', 'cafetin', 'paq 12 unid', 12, 'unidad', 18.30, 1.525000, 24, null),

  -- DESECHABLES
  ('Envase take-away', 'desechables', 'cafetin', 'paq 1000 unid', 1000, 'unidad', 340.00, 0.340000, 200, null),
  ('Servilletas napkin', 'desechables', 'ambos', 'paq 12×120 unid', 1440, 'unidad', 28.10, 0.019514, 500, null),
  ('Pitillos', 'desechables', 'cafetin', 'paq 500 unid', 500, 'unidad', 3.65, 0.007300, 200, null),

  -- COCINA / SANDWICHES
  ('Pan de sandwich (barra)', 'panaderia', 'cafetin', 'barra (8 sandwich)', 8, 'unidad', 6.00, 0.750000, 16, null),
  ('Pechuga de pollo', 'proteinas', 'ambos', 'kg', 1000, 'g', 8.00, 0.008000, 1000, null),
  ('Queso feta', 'lacteos', 'ambos', 'kg', 1000, 'g', 18.00, 0.018000, 500, null),
  ('Queso ricotta', 'lacteos', 'ambos', 'kg', 1000, 'g', 12.00, 0.012000, 500, null),
  ('Prosciutto', 'proteinas', 'cafetin', 'kg', 1000, 'g', 45.00, 0.045000, 500, null),
  ('Salmón ahumado', 'proteinas', 'cafetin', 'kg', 1000, 'g', 60.00, 0.060000, 500, null),
  ('Aceite de oliva', 'condimentos', 'ambos', 'L', 1000, 'ml', 12.00, 0.012000, 1000, null),

  -- DESAYUNOS COMEDOR
  ('Harina PAN', 'panaderia', 'comedor', 'kg', 1000, 'g', 1.50, 0.001500, 500, null),
  ('Huevos', 'proteinas', 'ambos', 'docena', 12, 'unidad', 3.50, 0.291667, 24, null),
  ('Queso arepero', 'lacteos', 'comedor', 'kg', 1000, 'g', 12.00, 0.012000, 500, null),
  ('Yogurt griego', 'lacteos', 'comedor', 'kg', 1000, 'g', 8.00, 0.008000, 500, null),
  ('Granola', 'panaderia', 'comedor', 'kg', 1000, 'g', 8.00, 0.008000, 500, null),
  ('Garbanzo (crudo)', 'otros', 'comedor', 'kg', 1000, 'g', 4.00, 0.004000, 500, null),

  -- AZÚCARES & EXTRAS
  ('Azúcar blanca en sobre', 'otros', 'ambos', 'paq 200 unid', 200, 'unidad', 5.00, 0.025000, 200, null),
  ('Alulosa', 'otros', 'ambos', '350g', 350, 'g', 10.90, 0.031143, 100, null),
  ('Proteína en polvo', 'otros', 'cafetin', '76 scoops', 76, 'unidad', 140.00, 1.842105, 76, null)
on conflict do nothing;
