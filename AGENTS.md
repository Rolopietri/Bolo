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
