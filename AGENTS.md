<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Iconos, no emojis

La app usa un set propio de iconos de línea en `src/components/icons.tsx`
(estilo feather, monocromáticos, heredan el color del texto vía `currentColor`,
tamaño por `className`). Al agregar o cambiar UI, **usa estos iconos** —o agrega
uno nuevo al mismo archivo con el mismo estilo— **en vez de emojis**.

- Para estados/semáforos: usa un pill de color con un puntito (campo `dot`), no
  emojis (nada de 🟢🟡🔴).
- Para advertencias: `WarningIcon` o el color del texto, no ⚠️.
- Glifos tipográficos neutros (✓ ✕ ✎ ↺ ★, flechas ← →) sí pueden quedarse.

## Cursor Cloud specific instructions

- Node 22 y npm. Instalar dependencias con `npm ci` (hay `package-lock.json`). Servidor de desarrollo: `npm run dev` (`next dev --webpack`), puerto 3000.
- Abrir **http://localhost:3000**. Next 16 bloquea los recursos de desarrollo si la página se abre por `127.0.0.1`: el HTML llega, pero la app no se hidrata y los botones no responden. El log del servidor lo dice y apunta a `allowedDevOrigins`.
- Sin `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` el proxy no pide login. Eventos, calendario y la lista vieja de tareas guardan en `localStorage` (en `/eventos` se puede crear un evento y sigue ahí al recargar). Cocina, Administración y Mercado leen Supabase: sin esas variables esas listas se quedan en «Cargando…».
- Verificación: `npm run test:unidades`, `npm run test:pce`, `npx tsc --noEmit` y `npm run build` pasan. `npm run test:modulos` falla en 4 casos porque el menú por defecto ya incluye `marketplace` y el script todavía espera solo cocina y administración. `npm run lint` reporta errores ya presentes en marketplace y operador.
