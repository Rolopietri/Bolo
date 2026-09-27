-- Administración · CXC: unificar clientes (alias)
-- Zetux a veces reporta a la misma persona con nombres distintos
-- (p. ej. "Marianela" y "Marianella Carrillo"). Aquí guardamos que un nombre
-- alterno (alias) corresponde a un cliente canónico, para agrupar su saldo e
-- historial bajo un solo cliente. Solo afecta cómo se AGRUPA/MUESTRA; no cambia
-- las cuentas ni los pagos ya guardados.
create table if not exists public.admin_cliente_alias (
  id uuid primary key default gen_random_uuid(),
  alias_key text not null unique,   -- nombre alterno, normalizado (sin acentos/mayúsculas)
  canonico text not null,           -- nombre a mostrar y bajo el cual se agrupa
  created_at timestamptz not null default now()
);
alter table public.admin_cliente_alias enable row level security;
