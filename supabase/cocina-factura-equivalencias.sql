-- Lector de facturas: memoria de equivalencias de la empresa.
-- ─────────────────────────────────────────────────────────────────
-- Cuando alguien confirma que la línea "HARINA PAN 1KG" de un proveedor es el
-- insumo "Harina de maíz", se guarda aquí. La próxima factura de ese proveedor,
-- escaneada por cualquier usuario de la empresa, sale con la línea ya asignada.
--
-- Hoy la base es de UN negocio, así que esta memoria es de la empresa entera y
-- nunca se comparte con otras. Cuando llegue el multi-cliente
-- (docs/ARQUITECTURA_MULTICLIENTE.md), esta tabla recibe `negocio_id` + RLS por
-- negocio como todas las demás.
--
-- Solo agrega (columna nueva y tabla nueva). No borra ni cambia datos.

-- RIF del proveedor: lo trae la factura y sirve para reconocerlo solo.
alter table public.proveedores add column if not exists rif text;
create unique index if not exists proveedores_rif_unico
  on public.proveedores (upper(replace(replace(rif, '-', ''), ' ', '')))
  where rif is not null and rif <> '';

create table if not exists public.factura_equivalencias (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid not null references public.proveedores(id) on delete cascade,
  -- Descripción normalizada (minúsculas, sin acentos ni espacios dobles). Es la
  -- llave de búsqueda; `descripcion` guarda cómo venía en la factura.
  descripcion_norm text not null,
  descripcion text not null,
  insumo_id uuid not null references public.insumos(id) on delete cascade,
  -- Unidades de compra del insumo por cada unidad de la factura. Ej.: la
  -- factura dice "20" (paquetes de 1 kg) y el insumo se compra por bulto de
  -- 20 kg → factor 0.05. Por defecto 1.
  factor_cantidad numeric not null default 1 check (factor_cantidad > 0),
  usos integer not null default 1,
  ultima_vez timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (proveedor_id, descripcion_norm)
);

create index if not exists factura_equivalencias_insumo
  on public.factura_equivalencias (insumo_id);

alter table public.factura_equivalencias enable row level security;
drop policy if exists faceq_select on public.factura_equivalencias;
drop policy if exists faceq_insert on public.factura_equivalencias;
drop policy if exists faceq_update on public.factura_equivalencias;
drop policy if exists faceq_delete on public.factura_equivalencias;
create policy faceq_select on public.factura_equivalencias for select to authenticated using (true);
create policy faceq_insert on public.factura_equivalencias for insert to authenticated with check (true);
create policy faceq_update on public.factura_equivalencias for update to authenticated using (true) with check (true);
create policy faceq_delete on public.factura_equivalencias for delete to authenticated using (true);
