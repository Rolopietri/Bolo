-- Denuncias del Mercado (reportar anuncios, estilo Instagram)
--
-- Una denuncia es un AVISO para moderación, no una eliminación. Son PRIVADAS:
-- el vendedor no sabe quién lo reportó, y los usuarios normales no pueden leer
-- las denuncias (no hay política de SELECT). Solo el operador las revisa con
-- service-role (o el futuro panel de operador). Una denuncia por persona por
-- anuncio (unique) para que no se pueda spamear.

create table if not exists marketplace_denuncias (
  id uuid primary key default gen_random_uuid(),
  anuncio_id uuid not null references marketplace_anuncios(id) on delete cascade,
  motivo text not null,
  detalle text,
  denunciante uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint marketplace_denuncias_una_por_persona unique (anuncio_id, denunciante)
);

create index if not exists marketplace_denuncias_anuncio_idx
  on marketplace_denuncias (anuncio_id);

alter table marketplace_denuncias enable row level security;

-- Crear: cualquier usuario autenticado denuncia (queda como suyo).
create policy "denuncias crear" on marketplace_denuncias
  for insert to authenticated with check (auth.uid() = denunciante);

-- NOTA: a propósito NO hay política de SELECT/UPDATE/DELETE. Así las denuncias
-- quedan privadas para los usuarios; solo el operador (service-role / panel)
-- las ve y actúa sobre ellas.
