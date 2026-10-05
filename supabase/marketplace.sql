-- Mercado (marketplace) de bolo
--
-- Anuncios GLOBALES (los ven todos los clientes de bolo): proveedores de
-- insumos, equipos de cocina y productos para revender. Cualquier usuario
-- autenticado publica; cada quien edita/borra lo suyo. Lectura abierta para
-- todos los usuarios autenticados. Sin pagos: solo conecta (contacto directo).

create table if not exists marketplace_anuncios (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('insumo', 'equipo', 'reventa')),
  titulo text not null,
  descripcion text,
  precio numeric,
  moneda text not null default 'USD',
  categoria text,
  ciudad text,
  contacto_nombre text,
  contacto_whatsapp text,
  foto_url text,
  publicado_por uuid default auth.uid(),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists marketplace_anuncios_tipo_idx
  on marketplace_anuncios (tipo);
create index if not exists marketplace_anuncios_activo_idx
  on marketplace_anuncios (activo, created_at desc);

alter table marketplace_anuncios enable row level security;

-- Lectura: cualquier usuario autenticado ve los anuncios.
create policy "marketplace leer" on marketplace_anuncios
  for select to authenticated using (true);

-- Crear: cualquier usuario autenticado publica (queda como suyo por el default
-- publicado_por = auth.uid()).
create policy "marketplace crear" on marketplace_anuncios
  for insert to authenticated with check (true);

-- Editar: solo el dueño del anuncio.
create policy "marketplace editar propios" on marketplace_anuncios
  for update to authenticated
  using (auth.uid() = publicado_por)
  with check (auth.uid() = publicado_por);

-- Borrar: solo el dueño del anuncio.
create policy "marketplace borrar propios" on marketplace_anuncios
  for delete to authenticated
  using (auth.uid() = publicado_por);
