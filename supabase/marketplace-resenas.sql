-- Reseñas del Mercado (ratings tipo Amazon)
--
-- Cada anuncio puede recibir reseñas (estrella 1–5 + comentario) de otros
-- usuarios. El promedio da confianza por producto; agregando las reseñas de
-- todos los anuncios de un vendedor se obtiene su reputación.
--
-- Reglas: una reseña por persona por anuncio (unique). Crear solo como uno
-- mismo; borrar solo la propia. Lectura abierta para autenticados. No reseñar
-- el propio anuncio se controla en la app.

create table if not exists marketplace_resenas (
  id uuid primary key default gen_random_uuid(),
  anuncio_id uuid not null references marketplace_anuncios(id) on delete cascade,
  calificacion int not null check (calificacion between 1 and 5),
  comentario text,
  autor uuid default auth.uid(),
  autor_nombre text,
  created_at timestamptz not null default now(),
  constraint marketplace_resenas_una_por_persona unique (anuncio_id, autor)
);

create index if not exists marketplace_resenas_anuncio_idx
  on marketplace_resenas (anuncio_id);

alter table marketplace_resenas enable row level security;

create policy "resenas leer" on marketplace_resenas
  for select to authenticated using (true);

create policy "resenas crear" on marketplace_resenas
  for insert to authenticated with check (auth.uid() = autor);

create policy "resenas borrar propias" on marketplace_resenas
  for delete to authenticated using (auth.uid() = autor);
