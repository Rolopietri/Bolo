# Quinta Mamá

App interna de operaciones para Quinta Mamá: cocina (insumos, recetas,
sub-recetas, stock, planes de producción, compras, ventas y pedidos),
eventos, presupuestos y tareas.

- **Framework:** Next.js 16 (App Router, webpack) + React 19 + TypeScript
- **Base de datos y auth:** Supabase (Postgres con RLS, triggers y Supabase Auth)
- **Estilos:** Tailwind CSS v4
- **Deploy:** Vercel, desde la rama `main` (deploy automático en cada push)

> **Ojo con la versión de Next:** este proyecto corre sobre una versión de
> Next.js con cambios importantes respecto a lo habitual. Antes de tocar código,
> lee la guía correspondiente en `node_modules/next/dist/docs/`. Ver también
> `AGENTS.md` (convenciones del proyecto, p. ej. usar los iconos de
> `src/components/icons.tsx` en vez de emojis).

## Cómo correr en local

Requisitos: **Node 22** y npm.

```bash
npm install
cp .env.local.example .env.local   # y llena los valores (ver abajo)
npm run dev                        # http://localhost:3000
```

Scripts útiles:

```bash
npm run build           # build de producción (lo mismo que corre Vercel)
npm run lint            # eslint
npx tsc --noEmit        # typecheck
npm run test:unidades   # chequeo del sistema de unidades (scripts/check-unidades.mjs)
```

## Variables de entorno

Se copian de `.env.local.example`. En **local** van en `.env.local`; en
**producción** se configuran en Vercel (Settings → Environment Variables).

| Variable | Dónde | Para qué |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | local + Vercel | URL del proyecto Supabase (pública). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | local + Vercel | Anon key de Supabase (pública, protegida por RLS). |
| `ALLOWED_EMAILS` | local + Vercel | Lista separada por comas de correos con permiso de login. |
| `SUPABASE_SERVICE_ROLE_KEY` | **solo Vercel** | Llave de servicio. La usan el cron de la tasa BCV y el portal de WiFi de invitados para escribir/leer con permisos de servidor. **Es secreta: nunca va en el repo ni en un `.env.local` compartido — solo en Vercel.** |
| `WIFI_SSID` / `WIFI_CLAVE` / `WIFI_MENSAJE` | opcional | Respaldo de la red de invitados si no se usa la tabla `wifi_config` (ver *WiFi de invitados*). |

Los valores de Supabase están en: Supabase → Settings → API.

## Base de datos (recrear desde cero)

El esquema y las funciones/triggers viven como archivos `.sql` sueltos en
`supabase/`, que se aplican a mano en el **SQL Editor** de Supabase.

**Orden de aplicación:** alfabético, y `cocina-zzz-motor-canonico.sql` **de
último** (por eso el prefijo `zzz-`: es la versión canónica del motor de stock y
tiene que ganar). Los detalles del porqué y qué archivos definen cada función
están en **[`supabase/README-migraciones.md`](supabase/README-migraciones.md)** —
léelo antes de reconstruir.

Puntos clave:

- `schema.sql` crea las tablas base (tareas, eventos) con RLS.
- Los archivos `cocina-*.sql`, `eventos-*.sql`, `presupuestos-*.sql`, etc. agregan
  el resto de tablas, columnas, funciones y triggers.
- Los `*-seed.sql` cargan datos iniciales (plantillas, mobiliario).
- La whitelist de acceso NO está en la base: se controla con `ALLOWED_EMAILS` en
  el código (`src/proxy.ts`).

Como las funciones usan `create or replace` (idempotentes), reaplicar el repo
completo en orden reconstruye el estado de producción.

## WiFi de invitados (QR)

El cliente escanea un QR en la mesa, cae en **`/wifi`** (página pública, sin
login), deja nombre, correo, teléfono y fecha de nacimiento, y recién entonces
ve la clave del WiFi. Cada registro va a `wifi_invitados`; si el correo ya
existe, se le suma una visita.

- **Panel interno:** `/admin/wifi` — genera y descarga el QR (con un “punto”
  opcional: terraza, barra, mesa 4…), edita la red y la clave que ve el
  invitado, y lista/exporta a CSV la base de clientes.
- **SQL:** `supabase/wifi-invitados.sql` (tablas `wifi_invitados` y
  `wifi_config`, más la función `wifi_registrar`).
- **Clave del WiFi:** sale de `wifi_config`, que el servidor lee con
  service-role. Si no hay service-role, usa `WIFI_SSID` / `WIFI_CLAVE`.
- **Ojo:** el QR **no** bloquea el internet por sí solo — el teléfono necesita
  datos móviles para abrir la página, y la clave del WiFi no debe estar escrita
  en ningún otro lado. Para bloquearlo de verdad hace falta un router con
  portal cautivo (Ubiquiti/UniFi, MikroTik, TP-Link Omada) apuntando a `/wifi`.

## Deploy

Vercel está conectado a este repo y despliega **automáticamente en cada push a
`main`**. El `vercel.json` define un cron diario (`/api/cron/bcv`) que actualiza
la tasa BCV. No hay pasos manuales de deploy.

## Estructura

```
src/app/            Rutas (App Router): cocina/, eventos/, presupuestos/, tareas/, api/
src/components/     UI compartida (icons.tsx = set de iconos de línea propio)
src/lib/            data/ (acceso a Supabase por módulo), units (sistema de unidades), types
src/proxy.ts        Middleware de auth + whitelist de correos (/wifi es público)
supabase/           Esquema y funciones SQL (ver README-migraciones.md)
scripts/            Utilidades (check-unidades.mjs)
docs/HISTORIA.md    Bitácora de decisiones y cambios importantes
```
