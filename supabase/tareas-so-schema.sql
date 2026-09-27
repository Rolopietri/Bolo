-- Sistema Operativo (tareas estratégicas) — La Quinta Mamá
-- ════════════════════════════════════════════════════════════════
-- Ejecuta este SQL en: Supabase → SQL Editor → New query.
-- Es ADITIVO: no toca las tablas existentes (tareas, eventos, cocina,
-- presupuestos). Crea el modelo de datos del sistema operativo descrito
-- en el traspaso (motor de priorización PCE, casa, objetivos, reportes).
--
-- Convención de nombres: todas las tablas llevan prefijo `so_` (sistema
-- operativo) para no chocar con nombres genéricos ya usados en la app
-- (eventos, tareas). La taxonomía (7 áreas · 27 sub-ejes) NO es una tabla:
-- es una constante de aplicación (ver src/lib/tareas-so/taxonomia.ts).
--
-- Regla no negociable (§3.1): una tarea sin objetivo NO entra al tablero;
-- por eso so_tarea.objetivo_id es NULLABLE (queda "retenida"), aunque el
-- flujo normal siempre le asigne uno.

-- ============================================================
-- PERSONAS
-- ============================================================
create table if not exists public.so_persona (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  correo text unique,                 -- null permitido; sin correo no se notifica
  activo boolean not null default true,
  rol text,                           -- descripción libre
  figura text,                        -- nómina | honorarios | colaboración
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- OBJETIVOS ESTRATÉGICOS
-- ============================================================
create table if not exists public.so_objetivo (
  id text primary key,                -- 'ESP-02-C1'
  area_id text not null,              -- 'ESP-02'
  sub_eje_id text not null,           -- 'ESP-02.1'
  horizonte text not null,            -- corto | mediano | largo
  titulo text not null,
  indicador text not null,
  meta numeric not null,
  actual numeric not null default 0,
  unidad text not null,
  sentido text not null default 'mayor',   -- mayor | menor
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_so_objetivo_area on public.so_objetivo(area_id);
create index if not exists idx_so_objetivo_sub on public.so_objetivo(sub_eje_id);

-- ============================================================
-- ESPACIOS DE LA CASA
-- ============================================================
create table if not exists public.so_espacio (
  id text primary key,                -- 'B1', 'S-ELE'
  nombre text not null,
  planta text not null,               -- 'Planta A' … 'Sistemas y envolvente'
  tipo text not null,                 -- privativo | común | servicio | sistema
  estado text not null default 'operativo',
                                      -- operativo | atención | intervención | fuera | definir
  nota text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- TAREAS
-- ============================================================
create table if not exists public.so_tarea (
  id text primary key,                -- 'T-0001', o 'WEB-1042' si entra del sitio
  titulo text not null,
  sub_eje_id text not null,
  objetivo_id text references public.so_objetivo(id) on delete set null,   -- NULLABLE (§3.1)
  espacio_id text references public.so_espacio(id) on delete set null,
  vence date,
  creada date not null default current_date,
  cerrada date,
  impacto text not null,              -- alto | medio | bajo | nulo
  proximidad text not null,           -- directa | requisito | apoyo
  patrimonio boolean not null default false,
  compromiso boolean not null default false,
  nota text,
  estado text not null default 'pendiente',
                                      -- pendiente | completado | descartado
  origen text not null default 'sistema',   -- sistema | web | vercel | importado
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_so_tarea_objetivo on public.so_tarea(objetivo_id);
create index if not exists idx_so_tarea_sub on public.so_tarea(sub_eje_id);
create index if not exists idx_so_tarea_espacio on public.so_tarea(espacio_id);
create index if not exists idx_so_tarea_estado on public.so_tarea(estado);

-- ============================================================
-- RESPONSABLES (N a N) — una tarea puede tener varios
-- ============================================================
create table if not exists public.so_tarea_responsable (
  tarea_id text not null references public.so_tarea(id) on delete cascade,
  persona_id uuid not null references public.so_persona(id) on delete cascade,
  primary key (tarea_id, persona_id)
);

-- ============================================================
-- VALORES ASOCIADOS (N a N)
-- ============================================================
-- valor: Comunidad | Autenticidad | Patrimonio | Acción | Excelencia | __tensiona
create table if not exists public.so_tarea_valor (
  tarea_id text not null references public.so_tarea(id) on delete cascade,
  valor text not null,
  primary key (tarea_id, valor)
);

-- ============================================================
-- SUBTAREAS — pasos internos, NO se puntúan (§3.5)
-- ============================================================
create table if not exists public.so_subtarea (
  id uuid primary key default gen_random_uuid(),
  tarea_id text not null references public.so_tarea(id) on delete cascade,
  titulo text not null,
  hecho boolean not null default false,
  orden int not null default 0
);
create index if not exists idx_so_subtarea_tarea on public.so_subtarea(tarea_id);

-- ============================================================
-- COMENTARIOS
-- ============================================================
create table if not exists public.so_comentario (
  id uuid primary key default gen_random_uuid(),
  tarea_id text not null references public.so_tarea(id) on delete cascade,
  persona_id uuid references public.so_persona(id) on delete set null,
  autor text,                         -- snapshot del nombre (por si la persona cambia)
  fecha timestamptz not null default now(),
  texto text not null
);
create index if not exists idx_so_comentario_tarea on public.so_comentario(tarea_id);

-- ============================================================
-- ESTRATEGIA EDITABLE POR SUB-EJE
-- ============================================================
create table if not exists public.so_sub_eje_estrategia (
  sub_eje_id text primary key,
  texto text,
  actualizada date
);

-- ============================================================
-- HITOS — historial que se genera SOLO (§3.6)
-- ============================================================
create table if not exists public.so_hito (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  sub_eje_id text,
  tipo text not null,                 -- medición | tarea | estrategia | estado |
                                      -- inventario | equipo | reporte | hito
  texto text not null,
  ref text,                           -- id de objetivo o tarea
  espacio_id text,
  avance int,                         -- solo en tipo='medición'
  avance_anterior int,
  created_at timestamptz not null default now()
);
create index if not exists idx_so_hito_sub on public.so_hito(sub_eje_id);
create index if not exists idx_so_hito_ref on public.so_hito(ref);

-- ============================================================
-- REPORTES QUINCENALES GENERADOS
-- ============================================================
create table if not exists public.so_reporte (
  id uuid primary key default gen_random_uuid(),
  periodo int not null,
  desde date not null,
  hasta date not null,
  generado date not null default current_date,
  url text
);

-- ============================================================
-- NOTIFICACIONES DESPACHADAS (evita reenvíos)
-- ============================================================
-- clave = tarea_id|tipo|persona   (tipo: creada | vence)
create table if not exists public.so_notificacion (
  clave text primary key,
  tarea_id text,
  persona_id uuid,
  tipo text not null,
  enviada timestamptz not null default now()
);

-- ============================================================
-- RLS — todos los usuarios autenticados pueden todo
-- (decisión del equipo: "todos pueden todo"; se puede endurecer luego)
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array[
    'so_persona','so_objetivo','so_espacio','so_tarea','so_tarea_responsable',
    'so_tarea_valor','so_subtarea','so_comentario','so_sub_eje_estrategia',
    'so_hito','so_reporte','so_notificacion'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "%s_all_auth" on public.%I;', t, t);
    execute format(
      'create policy "%s_all_auth" on public.%I for all to authenticated using (true) with check (true);',
      t, t);
  end loop;
end $$;

-- ============================================================
-- TRIGGERS updated_at (solo en las tablas que lo tienen)
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['so_persona','so_objetivo','so_espacio','so_tarea'] loop
    execute format('drop trigger if exists %s_set_updated on public.%I;', t, t);
    execute format(
      'create trigger %s_set_updated before update on public.%I for each row execute function public.set_updated_at();',
      t, t);
  end loop;
end $$;
