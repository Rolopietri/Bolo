# Bolo — Configuración necesaria

Diagnóstico del aviso **"Falta configurar"** en Administración y lista completa
de lo que un despliegue nuevo necesita. Este documento **no contiene valores**:
solo nombres de variables y dónde se configuran. Las llaves nunca van en el
repo, en `.env.local` compartidos ni en el navegador.

## 1. Por qué Administración dice "Falta configurar"

Cadena exacta:

1. `src/app/administracion/AdministracionClient.tsx:60` muestra `<SinConfig />`
   cuando `/api/admin/session` responde `configurado: false`.
2. `src/app/api/admin/session/route.ts:8` devuelve `adminConfigurado()`.
3. `src/lib/admin-auth.ts:18` → `adminConfigurado() = !!process.env.ADMIN_PASSWORD`.

**Única causa:** la variable `ADMIN_PASSWORD` no existe (o está vacía) en el
runtime del despliegue. Causas típicas en Vercel:

- No se creó en el proyecto (no figura en `.env.local.example` ni en el README).
- Se creó solo para *Preview* y el sitio es *Production* (o al revés).
- Se creó después del último despliegue y no se volvió a desplegar.

El texto del aviso también menciona `SUPABASE_SERVICE_ROLE_KEY`, pero esa
condición **no se comprueba**. Si falta, el aviso desaparece igual y después
del login cada sección falla con "servidor no configurado" (23 rutas
`/api/admin/*`, vía `src/lib/supabase/admin-service.ts`).

## 2. Variables de entorno

| Variable | Obligatoria | Ámbito | Para qué |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Sí | Público | URL del proyecto Supabase. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sí | Público (protegido por RLS) | Acceso de la app desde el navegador. |
| `ALLOWED_EMAILS` | Sí | Servidor | Lista de correos con acceso. Vacía = sin restricción (riesgo). |
| `SUPABASE_SERVICE_ROLE_KEY` | Sí para Administración, WiFi y crons | **Solo servidor (secreta)** | Las tablas `admin_*` tienen RLS sin políticas: solo se leen con esta llave, desde `/api/admin/*`. Debe ser del **mismo** proyecto Supabase que la URL. |
| `ADMIN_PASSWORD` | Sí para Administración | **Solo servidor (secreta)** | Candado de Administración y firma de la cookie de sesión. |
| `CRON_SECRET` | Recomendada | Solo servidor (secreta) | Sin ella, `/api/cron/notificaciones` queda abierto. |
| `RESEND_API_KEY`, `RESEND_FROM` | Opcional | Solo servidor (secreta) | Correos de alerta. |
| `ADMIN_ALERTA_EMAILS` | Opcional | Servidor | Respaldo de destinatarios si `admin_config.alerta_correos` está vacío. |
| `GOOGLE_CALENDAR_ICS_URL` | Opcional | Solo servidor (secreta) | Calendario de Google en solo lectura. |
| `WIFI_SSID`, `WIFI_CLAVE`, `WIFI_MENSAJE` | Opcional (módulo WiFi) | Servidor | Respaldo si no hay `wifi_config`. |

Después de crear o cambiar variables en Vercel hay que **volver a desplegar**.

### Límites servidor/cliente (verificado)

- Ningún archivo `"use client"` importa `admin-service`, `admin-auth` ni `wifi-server`.
- No hay secretos con prefijo `NEXT_PUBLIC_`.
- **Riesgo:** nada impide por diseño que alguien importe `admin-service` en un
  componente cliente. Se propone el paquete `server-only` (entrega B1).

## 3. Base de datos

Aplicar los `.sql` de `supabase/` en orden alfabético, con
`cocina-zzz-motor-canonico.sql` al final (ver `supabase/README-migraciones.md`).

**Faltan en el repo** (existen en producción o en código, pero no hay SQL para
crearlos en un ambiente nuevo):

| Objeto | Usado en | Efecto si falta |
|---|---|---|
| Tabla `admin_cierre_mensual` | `src/app/api/admin/cierre/route.ts` | Ninguna pantalla lo llama hoy. |
| Tabla `admin_movimiento` | `src/app/api/admin/movimientos/route.ts` | Ninguna pantalla lo llama hoy. |
| Bucket de Storage `facturas` (privado) | `src/app/api/admin/factura/route.ts` | Falla la subida de facturas. |
| Función `wifi_fusionar_cliente` y columnas de cédula en `wifi_invitados` | `src/lib/wifi-clientes.ts` ← `importar-facturas` | La importación de facturas intenta sincronizar clientes WiFi. |

Hay que exportarlos desde producción (solo esquema, sin datos) e incorporarlos
al repo antes de dar por reproducible un ambiente de ensayo.

## 4. Mensajes: técnicos vs. negocio

Hoy el usuario del negocio ve textos técnicos: nombres de variables, "servidor
no configurado" y `error.message` crudos de Postgres (unos 55 puntos en
`/api/admin`). La propuesta (entrega B1):

| Situación | Lo ve el usuario del negocio | Lo ve quien instala (diagnóstico / logs) |
|---|---|---|
| Falta `ADMIN_PASSWORD` | "Administración todavía no está activada. Pide a quien administra Bolo que la active." | `ADMIN_PASSWORD` no definida en este ambiente. |
| Falta la llave de servicio | "No pudimos cargar esta sección. Intenta más tarde; si sigue, avisa a quien administra Bolo." | `SUPABASE_SERVICE_ROLE_KEY` ausente o de otro proyecto. |
| Falta una tabla | Igual que la anterior. | `relation "admin_x" does not exist` → aplicar `admin-x.sql`. |
| Falta Resend | "El envío de correos no está activado." | `RESEND_API_KEY` ausente. |

El detalle técnico va al log del servidor y a una página de diagnóstico de
instalación que **no exige** la contraseña de Administración (justamente
porque puede faltar). En su lugar exige una sesión con rol de administrador
técnico y devuelve solo "presente / ausente", nunca valores.

## 5. Cambios de Bolo en Supabase (SQL Editor)

Igual que en la plataforma de Quinta Mamá: se pega cada archivo en
**Supabase → SQL Editor → Run**. Se aplican **solo en el proyecto de ensayo de
Bolo** (el de bolodemo, no el de Quinta Mamá). Para saber en cuál estás, mira la
dirección del navegador: `supabase.com/dashboard/project/<ref>`.

Todos los archivos `bolo-*.sql` son **aditivos e idempotentes**: no borran ni
modifican tablas existentes y se pueden correr más de una vez.

Desde el 2 de octubre de 2026 el SQL lo ejecuta Claude con el conector de
Supabase, previa autorización expresa de cada cambio.

Las pruebas terminan **siempre** con un mensaje rojo. Es a propósito: así
Supabase deshace todo lo que hizo la prueba.

- Si dice `BOLO-01 OK: n casos superados`, todo está bien.
- Si dice `BOLO-01 FALLA: …`, algo está mal; copia el mensaje.

### Datos de Quinta Mamá en una base nueva

Si algún día se crea una base de Bolo **desde cero**, ojo: varios archivos
"estructurales" del repo también cargan datos de Quinta Mamá:

- `cocina.sql`: insumos y el proveedor "Por definir";
- `cocina-recetas.sql`: recetas de la carta;
- `schema.sql`: tareas y eventos de ejemplo;
- `presupuestos.sql`: el catálogo de espacios;
- los archivos `*-seed.sql`.

Para un esqueleto limpio hace falta separar estructura y datos. Queda como
pendiente (no afecta a la base de ensayo actual).
