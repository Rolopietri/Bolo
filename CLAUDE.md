@AGENTS.md

# bolo

Plataforma de operaciones del día a día para negocios chicos de gastronomía (empezando por restaurantes chicos). Pensada para gente que hoy lleva todo en papel: **lo más simple posible**. Hablamos en español.

## Qué es

- Panel en Next.js desplegado en Vercel.
- Base de datos PostgreSQL en Supabase, propia de bolo (separada de cualquier otro proyecto).
- Núcleo: cocina→plato (costo real de cada plato), inventario, proveedores/compras, y tareas/objetivos. Todo lo demás son agregados opcionales según el tipo de negocio.
- Arquitectura hacia multi-tienda: una sola app que atiende a muchas tiendas, no una copia por cliente.
- El panel es la fuente de verdad.

## Regla de oro de producto

Tan fácil como el papel. Si el dueño del negocio no lo entiende solo en el primer minuto, hay que simplificarlo más. Cuando una pantalla haga cuentas, ofrece dos vistas: **simple** (solo el resultado) y **desglose** (la cuenta paso a paso, editable).

## Comandos

No adivines comandos. Léelos de `package.json` (scripts) y de la configuración de Supabase y Vercel del repo. El build usa webpack (`npm run build`). Si falta un comando necesario, pregúntame antes de inventarlo.

## Cómo trabajar

1. **Plan primero** en cualquier cambio que toque más de un archivo, la base de datos o el despliegue. Explica el plan en pocas líneas y luego ejecútalo.
2. **Pasos pequeños.** Un cambio lógico por commit, con mensaje claro en español.
3. **Verifica antes de dar algo por terminado:** que compile (build), que pasen las pruebas y que no haya errores de tipos ni de lint.
4. **Agrega, no quites:** no elimines módulos, casillas ni datos existentes sin que yo lo pida.
5. **Si algo falla dos veces seguidas** con el mismo enfoque, deténte, explícame qué pasa y propon alternativas.

## Base de datos (Supabase)

- Todo cambio de estructura va como migración en archivo dentro de `supabase/`. Nada de cambios manuales sin migración.
- Nunca edites una migración ya aplicada: crea una nueva.
- Antes de aplicar una migración, resume en una línea qué cambia.
- Cualquier cosa que borre tablas, columnas o datos (DROP, TRUNCATE, DELETE, `db reset`) requiere mi autorización. Explica qué se pierde y si hay respaldo.
- Mantén las políticas de seguridad (RLS) activas en tablas nuevas.

## GitHub y Vercel

- Puedes subir cambios y desplegar sin preguntarme, siempre que build y pruebas pasen antes.
- Si build o pruebas fallan, no subas ni despliegues: arregla primero o avísame.
- Nunca reescribas el historial (force push) sin preguntarme.
- Después de desplegar, revisa que el sitio cargue y dime qué se publicó.

## Diseño e identidad

- Usa los iconos propios en `src/components/icons.tsx`, **no emojis** (ver AGENTS.md).
- Identidad bolo: azul navy + naranja, letra redondeada (Baloo 2 / Nunito), fondo crema. Comercial, amigable y fácil para personas sin experiencia técnica.
- Estados con pill de color + puntito (semáforo), no emojis.

## Claves y contraseñas

- No leas ni modifiques `.env`, `.env.local`, claves, certificados ni variables de entorno de Vercel sin pedirme permiso.
- Nunca escribas una clave dentro del código, de un commit o de un mensaje.

## Al terminar una tarea

Dame un resumen corto: qué cambió, qué se subió o desplegó, y qué queda pendiente.
