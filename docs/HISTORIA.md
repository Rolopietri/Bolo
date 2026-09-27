# Historia del Proyecto — La Quinta Mamá

> Documento maestro: cómo nació la plataforma, qué decisiones se tomaron y por qué, qué quedó construido, qué falta. Diseñado para que cualquier persona (incluyendo un futuro Claude) entienda el proyecto en una lectura.

---

## TL;DR

**La Quinta Mamá** es una casa de salud y cultura en Caracas (edificio años 50, 4 plantas). El equipo (6 personas + directiva) opera eventos, inquilinos, cocina (cafetín + comedor), y mantenimiento.

A inicios de mayo 2026 empezamos a montar **un Notion** como panel central. Después de presentarlo al equipo, fue rechazado por "demasiado abrumador". Pivotamos a construir **una plataforma custom con Claude Code** desde cero.

**Hoy (final de mayo 2026)** la plataforma está LIVE en https://quinta-mama.vercel.app con:

- ✅ Tareas · Eventos · Cómo Trabajamos · La Quinta (info de la casa)
- ✅ **Presupuestos** con PDF branded (resumido + detallado)
- ✅ **Sistema de Cocina completo** (M1 insumos, M2 recetas, M3+M4 rentabilidad, M5 ventas/alertas/pedido sugerido)
- ✅ Login con Google OAuth, paleta y tipografía editorial
- ⏳ Falta: Fase 5 (versionado completo de 4 meses + escenario C)

---

## Equipo y stakeholders

**Directiva:**
- Ana María Pietri — Directora
- Rodrigo Lopez Pietri — Director · Fundador · CEO (cliente principal del proyecto)

**Operación:**
- Beatriz Márquez — Gerente General
- Lucía Dickson — Gerente de Gastronomía (líder del sistema de cocina)
- Inés — Head Chef · Junta Directiva
- Luis Castellanos — Encargado de Mantenimiento
- Wladimir Beleño — Mantenimiento
- Ana Velásquez · Aurora Hernández — Anfitrionas

**Whitelist de la plataforma (env var `ALLOWED_EMAILS`):**
- `rolopietri@gmail.com` (Rodrigo)
- `beamm7@gmail.com` (Beatriz)
- `luciadicksonc@gmail.com` (Lucía)
- `ines.margara@gmail.com` (Inés)
- `oapietrib@gmail.com` (Oscar)
- `info@quintamama.com` (institucional)

---

## Cronología — cómo llegamos hasta aquí

### Fase 0 — Limpieza de Notion (mayo 6-7)

**Punto de partida:** Rodrigo tenía un Notion con un template "Company OS" lleno de duplicados (Tareas en dos lugares, Manual del Empleado vs Equipo & Roles, etc.). El equipo no sabía dónde anotar nada.

**Decisiones:**
- Hub Central queda como home única; todo lo del template se archiva o migra
- Cada concepto vive en UN solo lugar
- "🎯 Objetivos" pasó de checklist estático → base de datos viva con estados y % progreso
- Sistema de Manual del Empleado (vacaciones, contratación, evaluaciones, etc.) migrado a "Equipo & Roles"
- "📋 Guía de Trabajo" movida bajo Hub Central + agregada al menú de Acceso Rápido

**Patrón de diseño establecido:** páginas con mucha info llevan un `<table_of_contents/>` "Guía Rápida" arriba; el resto del contenido se condensa a 1-2 líneas por sección (sin fluff corporate).

### Fase 1 — Decisión de pivotar (mayo 8)

Rodrigo presentó el Notion al equipo. Reacción: *"está muy complicado, la sola apariencia visual nos asusta"*. Decisión: **construir una plataforma custom desde cero con Claude Code**.

**Restricciones decididas:**
- Web responsive (no app nativa)
- 5 editores: Rodrigo, Beatriz, Lucía, Inés, Oscar
- Login con Google
- **Deadline: lunes 11 de mayo** (3 días)
- Mientras tanto: Notion queda con SOLO Tareas + Observaciones (mínima)
- Evento importante: 30 de mayo

### Fase 2 — MVP local (mayo 8 noche - mayo 9)

- Instalación de Node.js vía nvm (Mac no tenía Node)
- Scaffolding de Next.js 16 + Tailwind 4 + TypeScript en `/Users/rodrigolopez/Desktop/CLAUDE/quinta-mama`
- Construcción de las 5 páginas con datos mock en localStorage:
  - Home con 4 tarjetas
  - Tareas (CRUD completo)
  - Eventos (CRUD con próximos/pasados)
  - Cómo Trabajamos (protocolos cortos)
  - La Quinta (info de la casa)
- Deploy a Vercel (alias `quinta-mama.vercel.app`)

### Fase 3 — Supabase + autenticación (mayo 9)

- Rodrigo creó proyecto Supabase: `slbcvapfniflclzbvobx`
- Configuración de env vars en Vercel
- Migración de localStorage → Supabase Postgres con RLS
- **Bug crítico encontrado:** `proxy.ts` no funciona con Turbopack en Next.js 16.2.6 (error: "must export a function named `proxy`"). Solución: usar `--webpack` en dev y build.
- **Bug del magic link:** rate limit del servicio de email gratuito de Supabase (~4/hora). Pivot a **Google OAuth** como método primario, magic link como fallback.
- Whitelist verificada en `/auth/callback`: si el email no está en `ALLOWED_EMAILS`, signOut + redirect.

### Fase 4 — Identidad visual editorial (mayo 10-11)

- **Paleta institucional:** cacao (#0A0A0A texto negro), terracotta (acentos), marfil (hairlines y fondos), oliva/azul-polvo/coral (heredados de marca)
- **Tipografías:** Cinzel (display) + Jost (clon libre de Futura para body) + EB Garamond (italic editorial)
- **Logos** SVG optimizados con SVGO (35% más livianos), favicon + apple-icon generados
- **Refresh editorial estilo Soho House**: cards numeradas 01-06, hairlines en vez de bordes gruesos, sin colores decorativos, mucho aire
- **Tagline oficial:** "Donde la cultura y el bienestar florecen."
- Refinamientos en Cómo Trabajamos (sin emojis, color unificado, protocolos completos) y La Quinta (plantas A/B/C/D con imágenes de planos extraídas del Drive, equipo con siluetas placeholder)

### Fase 5 — Presupuestos (mayo 12 aprox)

Sistema completo de cotización para eventos:

- **Catálogo editable** en `/admin/servicios` con seed del Dossier 2026 de Lucía:
  - Espacios (Salón A1, B1, B5, C2, C6, Jardín, Canchas de pádel) con tarifas día/medio día/bloque/mes
  - Equipo (anfitriona $40, mesonero $40, bartender $50, limpieza/higiene $40)
  - Pádel (paleta $10, pote pelotas $10, canchas $100/bloque)
  - Planta eléctrica $400
  - Catering, valet parking como "manual"
- **Form de presupuesto** `/presupuestos/nuevo` con cliente + evento + selector de servicios + descuento + validez
- **Numeración automática** PRES-2026-001, 002, etc.
- **PDF dual** generado con `@react-pdf/renderer`:
  - **Resumido** — lista de servicios sin precios individuales, solo total
  - **Detallado** — desglose línea por línea
- **Términos finales** (decisión con Rodrigo): 15 días validez, 50% adelanto, cancelación >7 días reembolso 100%, <7 días sin reembolso
- **Datos fiscales** del PDF: Proyectos Quinta Mamá, C.A. · RIF J-50685696-4 · Calle Ciega con Av. Mohedano, Country Club, Caracas
- **Bug crítico de PDF:** dos URLs de Google Fonts (Cinzel y EB Garamond) regresaban 404. Solución: descargar las 9 fuentes a `/public/fonts/` y cargarlas vía `fs.readFileSync` + base64 data URI.
- **Estados:** Borrador → Enviado → Aprobado/Rechazado. Al aprobar: botón "Crear evento desde presupuesto".

### Fase 6 — Sistema de Cocina (mayo 15-17)

Lucía envió un documento de requerimientos de 6 páginas describiendo un sistema de 5 módulos encadenados (M1 insumos → M2 recetas → M3 costeo → M4 rentabilidad → M5 inventario+POS). Trabajamos por fases:

#### M1 — Insumos, Proveedores, Compras (mayo 15)

- Schema `cocina.sql`: proveedores, insumos, compras, tasa_bcv, historial precios
- **Seed precargado con ~50 insumos** del Excel "Costos cafetería" de Lucía (café, lácteos, frutas, panadería, proteínas, bebidas, desechables)
- **Multi-moneda:** USD como referencia, Bs con tasa BCV/euro/paralela almacenadas por compra
- **Vercel Cron diario** (9am Caracas) que trae tasa BCV oficial desde `ve.dolarapi.com`
- **Bug:** el cron usa anon key pero RLS exigía authenticated → fix `cocina-fix-cron-rls.sql` que permite anon insert solo a `tasa_bcv`
- **Triggers SQL** automáticos: al insertar compra → actualiza stock + rota últimas 2 compras + actualiza precio. Al cambiar precio → registra en historial.
- **Aclaración importante con Rodrigo:** no son 2 locales, es 1 local con 2 secciones operativas (Cafetín + Comedor)

#### M2 — Recetario (mayo 15-16)

- Schema `cocina-recetas.sql`: recetas + receta_ingredientes (con `costo_manual_usd` para ad-hoc)
- **11 recetas precargadas:**
  - 7 smoothies del PDF de Lucía: Guayaba Sunrise, Cacao Papelón Power, Parchitada, Green Ávila, Fresas con Crema, Peanut Butter Cup, Vitamina C
  - 4 platos del Cafetín: Desayuno Caraqueño, Omelette Country, Bowl de Yogurt, Huevos Mamá
- **Form de receta** con selector visual de ingredientes (clic para agregar del catálogo, o "ingrediente libre" con precio manual)
- **Costo se calcula en vivo** mientras editas
- **PDF imprimible** branded para la cocina (sin precios), formato inspirado en el PDF de Smoothies de Lucía
- **Bugs arreglados:**
  - Precio editable para ingredientes ad-hoc (agregamos columna `costo_manual_usd`)
  - Edit se quedaba colgado en "Guardando..." porque `router.push` iba a la misma URL — fix: callback `onSaved` que cierra el editor manualmente
  - Botón "Eliminar receta" no funcionaba bien en mobile (`confirm()` nativo se traga) — fix: modal in-page con loading state

#### M3 + M4 — Costeo & Rentabilidad (mayo 16-17)

- Schema `cocina-config.sql`: singleton `cocina_config` con food cost objetivo, gastos operativos %, umbrales de semáforo
- **Panel maestro** `/cocina/rentabilidad` con tabla de TODAS las recetas:
  - Costo/porción · Precio actual · Precio sugerido al food cost objetivo · Food cost % · Margen bruto/neto · Semáforo
  - 4 tarjetas de stats (verde/amarillo/rojo/sin precio)
  - Filtros por sección + estado · ordenable por margen (asc = ver problemas primero)
- **Calculadora en detalle de receta:** 4 presets de food cost (25/30/35/40%) muestran el precio sugerido para cada nivel
- **Parámetros editables** desde el panel sin tocar SQL

#### M5 — Ventas, alertas, pedido sugerido (mayo 17)

- Schema `cocina-ventas.sql`: tabla `ventas` + columna `xetux_nombre` en recetas + 2 triggers
- **3 páginas:**
  - `/cocina/ventas` — 3 pestañas: registro manual, import CSV de Xetux (con auto-detect de columnas + preview de matches), historial
  - `/cocina/alertas` — clasifica insumos en agotados/bajos/sin mínimo configurado
  - `/cocina/pedido` — calculadora que toma "X raciones de receta Y" → lista de compras agrupada por proveedor con costo estimado
- **Triggers automáticos:**
  - Insertar venta → descuenta stock proporcional a la receta vendida
  - Eliminar venta → devuelve el stock (compensación inversa)
- **Match fuzzy CSV → recetas** por nombre normalizado, fallback al campo `xetux_nombre` configurable por receta
- **Pendiente:** integración directa con Xetux API (Lucía aún no consigue credenciales). El import CSV cubre el caso hoy.

---

## Arquitectura técnica

### Stack

- **Framework:** Next.js 16.2.6 (App Router, Server Components por defecto)
- **UI:** Tailwind CSS 4 con design tokens en `globals.css`
- **DB:** Supabase Postgres con RLS habilitado en todas las tablas
- **Auth:** Supabase Auth con Google OAuth + magic link como fallback
- **PDF:** `@react-pdf/renderer` server-side (runtime nodejs)
- **Deploy:** Vercel (auto desde CLI con `vercel deploy --prod --yes`)
- **Cron:** Vercel Cron (config en `vercel.json`)

### Decisiones grabadas

| Decisión | Por qué |
|---|---|
| Next.js 16 + webpack (no Turbopack) | Bug de Turbopack con `proxy.ts` en esta versión |
| Supabase en vez de Firebase/PocketBase | Postgres real, RLS, Auth integrada, buen tier gratis |
| `@react-pdf/renderer` en vez de Puppeteer | Más liviano, React puro, sin headless Chrome |
| Fuentes locales en `/public/fonts/` | URLs de Google Fonts cambian de versión, rompen el PDF |
| Logo en PNG además de SVG | react-pdf no rasteriza SVG complejo bien |
| Anon key para cron BCV | Más simple que service_role, RLS permite solo `tasa_bcv` |
| Texto negro (no cacao marrón) | Decisión editorial: más legible, más Soho House |
| `cocina_config` como singleton (id=1) | Mejor que key/value, queries más simples |
| Ingredientes ad-hoc con `costo_manual_usd` | Permite costear líneas libres sin forzar a crear insumo |
| Match fuzzy de Xetux por nombre normalizado | Mejor UX que pedir mapping manual exacto desde el día 1 |
| Triggers SQL para stock | Atómico, consistente, no se puede saltar desde la UI |

### Quirks (cosas que un futuro dev debe saber)

1. **`proxy.ts` vive en `src/proxy.ts`**, no en la raíz (porque `--src-dir`)
2. **En Next.js 16, `middleware.ts` se renombró a `proxy.ts`** y la función se llama `proxy`
3. **El Bash tool del Claude Code no carga `.zshrc`** — siempre prefijar con `source $HOME/.nvm/nvm.sh`
4. **El seed de recetas usa CTE con subqueries** porque los UUIDs de insumos son aleatorios:
   ```sql
   with r as (insert into recetas... returning id)
   insert into receta_ingredientes (..., insumo_id, ...)
   select r.id, (select id from insumos where nombre ilike 'X' limit 1), ... from r;
   ```
5. **`confirm()` nativo se traga en mobile Safari/Chrome** — usar modal in-page
6. **Vercel Cron Hobby plan = solo 2 jobs daily** (suficiente para nosotros)

---

## SQL aplicado en Supabase

Todos viven en `supabase/`. Aplicar en este orden si se rehace la BD:

| # | Archivo | Crea | Estado |
|---|---|---|---|
| 1 | `schema.sql` | tareas, eventos, función `set_updated_at` | ✅ |
| 2 | `presupuestos.sql` | presupuestos, presupuesto_items, secuencia numeración | ✅ |
| 3 | `cocina.sql` | proveedores, insumos, compras, tasa_bcv, historial precios + seed ~50 insumos | ✅ |
| 4 | `cocina-fix-cron-rls.sql` | políticas RLS para que el cron pueda escribir `tasa_bcv` | ✅ |
| 5 | `cocina-recetas.sql` | recetas, receta_ingredientes + seed 11 recetas reales | ✅ |
| 6 | `cocina-recetas-costo-manual.sql` | columna `costo_manual_usd` en ingredientes ad-hoc | ✅ |
| 7 | `cocina-config.sql` | singleton de parámetros de rentabilidad | ✅ |
| 8 | `cocina-ventas.sql` | ventas + `xetux_nombre` en recetas + 2 triggers de stock | ✅ |

**Migraciones posteriores (feature/fix).** Además de las 8 de arriba hay ~34 más
(POS, subrecetas, planes de producción, motor canónico, fixes de unidad/precio).
Reglas para un rebuild correcto — el **orden cronológico de commits reproduce
exactamente la base en vivo**:

- Primero los esquemas base (`cocina.sql`, `cocina-recetas.sql`,
  `cocina-subrecetas.sql`, `cocina-ventas.sql`, `cocina-planes-produccion.sql`…),
  luego POS/fixes.
- `cocina-fix-conversion-descuento-stock.sql` (funciones de unidad:
  `convertir_para_costo`, `unidad_norm/dim/factor`) antes de lo que las use.
- **`cocina-zzz-motor-canonico.sql` se aplica de ÚLTIMO** entre las que definen
  triggers de stock: es la **fuente única** de
  `descontar_stock_por_venta` / `revertir_stock_por_venta` /
  `liberar_comprometido_por_venta` / `recommit_comprometido_por_venta` /
  `flatten_receta_*` (incluye subrecetas y "sin X"). Los archivos que antes las
  definían quedan como marcadores "MOVIDA".
- El comprometido se recalcula con `recalcular_stock_comprometido`
  (`cocina-recalcular-comprometido.sql`, blindada para convertir unidades).

**Nunca asumir que el usuario ya corrió una migración nueva.** Cuando se crea SQL nuevo, recordarle explícitamente que la corra en SQL Editor.

---

## URLs y rutas

### Producción

- **App:** https://quinta-mama.vercel.app
- **Supabase dashboard:** https://supabase.com/dashboard/project/slbcvapfniflclzbvobx
- **Vercel project:** `quinta-mama/quinta-mama` (owner `rolopietri-4622`)

### Rutas del sitio

**Públicas:**
- `/login` — Google OAuth + magic link
- `/auth/callback` — proceso OAuth con verificación de whitelist
- `/api/cron/bcv` — cron diario BCV (sin auth)

**Protegidas (requieren login):**
- `/` — Home con 6 cards
- `/tareas` — CRUD de tareas
- `/eventos` — CRUD de eventos
- `/como-trabajamos` — protocolos del equipo (estática)
- `/la-quinta` — info de la casa, equipo, inquilinos (estática)
- `/presupuestos` — lista + `/nuevo` + `/[id]` con descarga de PDF
- `/admin/servicios` — catálogo editable de servicios para presupuestos
- `/cocina` — hub de cocina con 6 cards M1-M5
- `/cocina/insumos` — catálogo de insumos
- `/cocina/proveedores` — directorio
- `/cocina/compras` — registro de compras
- `/cocina/recetas` — lista + `/nuevo` + `/[id]`
- `/cocina/rentabilidad` — panel maestro M3+M4
- `/cocina/ventas` — 3 pestañas (manual, importar Xetux, historial)
- `/cocina/alertas` — stock bajo / agotado
- `/cocina/pedido` — calculadora de pedido sugerido

### Endpoints API

- `/api/login`, `/api/logout`
- `/api/presupuestos/[id]/pdf?modo=resumido|detallado`
- `/api/cocina/recetas/[id]/pdf`
- `/api/cron/bcv`

---

## Onboarding rápido (para retomar el proyecto)

```bash
# 1. Activar Node (siempre)
source $HOME/.nvm/nvm.sh

# 2. Ir al proyecto
cd /Users/rodrigolopez/Desktop/CLAUDE/quinta-mama

# 3. Instalar deps si es necesario
npm install

# 4. Dev server local
npm run dev    # ya configurado con --webpack

# 5. Deploy a producción
vercel deploy --prod --yes
```

**Env vars necesarias** (en `.env.local` y en Vercel):
```
NEXT_PUBLIC_SUPABASE_URL=https://slbcvapfniflclzbvobx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
ALLOWED_EMAILS=rolopietri@gmail.com,beamm7@gmail.com,...
```

---

## Pendientes

### Fase 5 — Versionado completo (no urgente)

El esquema YA captura cambios de precio en `insumo_precio_historico` silenciosamente. Falta:

- **UI de historial** por insumo (línea de tiempo)
- **Versionado de recetas** — guardar copia completa de la versión anterior al modificarse (snapshot JSON)
- **Comparación side-by-side** de dos versiones
- **Escenario C** — cuando cambia precio del insumo Y la receta al mismo tiempo, desglosar qué porcentaje del cambio en costo vino de cada uno
- **Alerta de impacto en margen** cuando un cambio empuja una receta a zona roja
- **Período de retención: 4 meses mínimo** (definir cron de purge)

### Integraciones futuras

- **API directa Xetux** — cuando Lucía consiga credenciales/docs, sustituir el flujo de import CSV por sync automático al cierre de día
- **Notificaciones WhatsApp** vía API — alertar al equipo cuando algo entra en stock bajo o cuando hay venta grande
- **PDF de orden de compra** — exportar el pedido sugerido como PDF formal para mandar al proveedor

### Mejoras menores

- Dominio custom (algo como `cocina.quintamama.com` o `app.quintamama.com`) en vez de `quinta-mama.vercel.app`
- Subida de fotos para las recetas (campo `foto_url` existe pero no hay UI de upload)
- Subida de logos / imágenes de marca para personalizar PDFs por evento
- Roles efectivos (hoy todos los whitelisted son admin de facto)

---

## Lecciones aprendidas

1. **El equipo es el cliente real, no Rodrigo.** El Notion fracasó porque Rodrigo lo entendía pero Beatriz/Lucía/Inés no. Filtro de diseño: "¿Lo entiendes en 5 segundos sin explicación?"
2. **Migrar siempre con seed real.** Importar el Excel de Lucía nos ahorró días de tipeo y dio confianza inmediata.
3. **Build por fases con valor entregable cada una.** El equipo empezó a usar el sistema desde el día 1, no esperando 3 semanas.
4. **Schema diseñado para futuro desde día 1.** El historial de precios se captura silenciosamente aunque la UI venga en Fase 5.
5. **Los bugs siempre cuentan algo.** El de "edit colgado" reveló que `router.push` no remonta la página si la URL no cambia. El de `confirm()` reveló que mobile browsers se comportan distinto.
6. **La generación de PDFs requiere fuentes locales.** Las URLs externas se rompen sin aviso.
7. **`source $HOME/.nvm/nvm.sh` siempre.** El Bash tool no hereda el shell del usuario.

---

## Filosofía visual establecida

Inspiración: **Soho House**.

- 3 tipografías con jerarquía clara: **Cinzel** (display) · **Jost** (UI/body) · **EB Garamond** (italic editorial)
- Texto en **negro** (#0A0A0A), no marrón
- Fondo **blanco puro** (no marfil) — decisión para evitar contraste con logos en SVG
- **Hairlines** (border 1px marfil) en vez de bordes gruesos
- **Sin colores decorativos** en cards — todo blanco con hairline
- **Numeración 01–06** en cards en vez de iconos coloridos
- **Eyebrow** (small caps con tracking amplio) arriba del título
- **Italics editoriales** en taglines y descripciones (Garamond)
- **Acento único terracotta** solo en hover y CTAs destructivos
- **Mucho aire**, mucha respiración entre secciones

Tagline oficial: *"Donde la cultura y el bienestar florecen."*

---

## Calendario compartido (sept 2026)

Se agregó un **calendario tipo Google Calendar** en la página inicial (y en su
propia ruta `/calendario`, "pantalla completa"). Objetivo: que todo el equipo
vea reuniones y eventos del año, y ponga **objetivos/metas** con fecha para
darles seguimiento en las reuniones semanales.

Decisiones:

- **Tabla propia `calendario_items`** (SQL en `supabase/calendario.sql`), en vez
  de mezclar las tablas `eventos`/`tareas` existentes. Mantiene el calendario
  simple y autocontenido. Mismo patrón de RLS que `eventos` (authenticated =
  todo permitido) y trigger `set_updated_at`.
- **4 tipos** diferenciados por color (pill + puntito, sin emojis, según
  `AGENTS.md`): Evento (rosa), Reunión (azul), Objetivo/Meta (verde), Tarea
  (ámbar). Config en `TIPOS_CALENDARIO` (`src/lib/types.ts`).
- **Responsable**: se elige de la lista real del equipo (`so_persona` vía
  `listPersonas()`), guardado como texto para seguir la convención de la app.
  **Área**: reusa `AREAS`.
- Vista de mes con navegación, filtros (tipo / persona / área), agenda del día
  seleccionado, y alta/edición/borrado. Los **eventos del módulo Eventos** se
  superponen en solo-lectura (toggle "Mostrar eventos"; clic → su ficha).
- Data-access en `src/lib/data/calendario.ts` con respaldo `localStorage` (igual
  que `eventos.ts`). UI en `src/app/calendario/CalendarioClient.tsx`.
- **Pendiente de operación**: aplicar `supabase/calendario.sql` una vez en el
  SQL Editor de Supabase para crear la tabla en producción.

### Integración con Google Calendar (read-only)

El calendario del panel también refleja el Google Calendar de `info@quintamama.com`
(one-way, Google → panel):

- `src/lib/google-calendar.ts` parsea el feed **iCal secreto** con `node-ical`,
  expande recurrentes (RRULE), respeta EXDATE/overrides y presenta fechas/horas
  en `America/Caracas`.
- Ruta `src/app/api/calendario/google/route.ts` (runtime node, caché 10 min):
  lee `GOOGLE_CALENDAR_ICS_URL` (env, **solo Vercel** — es secreta), descarga el
  `.ics` y devuelve los eventos de −3 a +12 meses. Si la env falta o el feed
  falla, devuelve `[]` (no rompe nada).
- En `CalendarioClient` los eventos de Google se superponen en **violeta**
  (solo lectura), con toggle "Google Calendar".
- **Pendiente de operación**: en Google Calendar copiar "Dirección secreta en
  formato iCal" y ponerla en Vercel como `GOOGLE_CALENDAR_ICS_URL`.

## Cómo me hablo conmigo mismo en futuras sesiones

Si abres una conversación nueva con Claude (o Claude Code) sobre este proyecto:

1. **Las memorias en `~/.claude/projects/-Users-rodrigolopez-Desktop-CLAUDE/memory/` se cargan automáticamente.** Allí está el contexto sintetizado.
2. **Este documento (HISTORIA.md) es la fuente de verdad cronológica.** Si la memoria y este doc divergen, este doc gana.
3. **Para retomar trabajo, basta con decir:** *"Estoy trabajando en la plataforma de Quinta Mamá. Quiero [agregar X / arreglar Y]."* — el contexto se activa solo.

---

*Documento mantenido por Rodrigo (con asistencia de Claude Code). Última actualización: mayo 2026.*
