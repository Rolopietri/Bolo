# BoloApp — Plan de arquitectura multi-cliente + observabilidad

> Documento de planificación. Define cómo convertir BoloApp (hoy de un solo
> negocio) en un producto multi-cliente vendible, y cómo monitorearlo.
> Es un plan vivo: se ajusta a medida que avanzamos.

## 1. Objetivo

Pasar de **una app para un negocio** a **un producto donde cada negocio tiene
su propia cuenta**, con sus datos aislados, y que nosotros podamos **vender,
operar y monitorear** sin que un cliente vea los datos de otro.

## 2. Estado actual (dónde estamos parados)

- App a medida: **Next.js 16 + Supabase (Postgres) + Vercel** (usabolo.com).
- **Autenticación:** ya usa Supabase Auth (login por correo, sesión por cookie).
- **Datos:** NO están separados por negocio. Todas las tablas (ventas, compras,
  insumos, recetas, cuentas por cobrar, tareas…) son de **un solo negocio**.
  No hay `negocio_id` ni reglas que aíslen por cuenta.
- **Conclusión:** tenemos la base de login, pero falta todo el "esqueleto
  multi-cliente" (cuentas, pertenencia, aislamiento).

## 3. Modelo de multi-inquilino — recomendación

Hay tres formas clásicas de separar clientes en una base de datos:

| Modelo | Qué es | Pros | Contras |
|---|---|---|---|
| **Base compartida + `negocio_id`** (recomendado) | Una sola base; cada fila lleva a qué negocio pertenece; reglas RLS impiden ver lo ajeno | Simple de operar, barato, una sola migración, fácil de monitorear | Hay que ser disciplinado con `negocio_id` y RLS en cada tabla |
| Esquema por cliente | Un "esquema" de Postgres por negocio | Buen aislamiento | Complejo de migrar y mantener a escala |
| Base por cliente | Una base por negocio | Máximo aislamiento | Caro y pesado de operar; sobra para esta etapa |

**Recomendación: Base compartida + `negocio_id` + RLS.** Es el estándar para un
SaaS en esta etapa (decenas o cientos de clientes), el más barato y el que mejor
encaja con lo que ya tenemos en Supabase. Si algún día un cliente grande exige
aislamiento físico, se puede mover ese cliente a su propia base más adelante.

## 4. Piezas a construir

### 4.1 Modelo de cuentas
- Tabla **`negocio`** (el inquilino): id, nombre, estado (activo/suspendido),
  plan, fecha de alta.
- Tabla **`negocio_usuario`** (quién pertenece a qué negocio y con qué rol):
  `negocio_id`, `user_id` (de Supabase Auth), `rol`.
- Roles dentro de un negocio: **dueño**, **operador** (y los que hagan falta).
- Rol especial nuestro: **super-admin de BoloApp** (ve todas las cuentas; vive
  fuera de `negocio_usuario`, en una lista aparte).

### 4.2 Aislamiento de datos (lo más crítico)
- Agregar **`negocio_id`** a **todas** las tablas de datos del negocio.
- Activar **RLS (Row Level Security)** en cada una, con la regla: "solo puedes
  ver/escribir filas de un negocio al que perteneces". Así, aunque haya un bug
  en el código, **la base misma impide** que un negocio vea datos de otro.
- La sesión debe resolver **el negocio activo** del usuario y usarlo en cada
  consulta.

### 4.3 Alta de un negocio nuevo (onboarding)
- Flujo de **registro de negocio**: crea el `negocio`, su primer usuario (dueño),
  y datos semilla mínimos (categorías base, etc.).
- Opcional: invitar a más usuarios (operadores) al negocio.

### 4.4 Panel de super-admin (BoloApp)
- Pantalla **solo para nosotros**: lista de todos los negocios, su estado, su
  actividad (último uso, # de usuarios, volumen de datos), y accesos para
  soporte. Este es el "ver las cuentas de los clientes" que pediste — **nace de
  aquí**, no antes.

### 4.5 Facturación / planes (fase posterior)
- Definir planes (gratis/pago), límites por plan, y cobro (pasarela). Se diseña
  cuando el producto ya tenga clientes reales.

## 5. Camino de migración (sin romper lo que hay)

El negocio actual (BoloApp / ex–Quinta Mamá) se vuelve **el primer `negocio`**.

1. **Preparar** el modelo: crear tablas `negocio` y `negocio_usuario`; crear el
   primer `negocio` y asociarle los usuarios actuales.
2. **Agregar `negocio_id`** a cada tabla de datos, rellenando todas las filas
   existentes con el id del primer negocio (nadie pierde datos).
3. **Activar RLS** por negocio, tabla por tabla, verificando que la app sigue
   funcionando igual para el negocio actual.
4. **Resolver el negocio activo** en la sesión y pasarlo en las consultas.
5. **Onboarding** de negocios nuevos.
6. **Panel de super-admin.**

Se hace **por fases, en orden**, probando en cada paso. En ningún momento se
"apaga" la app actual.

## 6. Observabilidad (en paralelo)

Para "ver el flujo y dónde se rompe", sin depender de n8n/Make:

- **Sentry** — rastreo de errores: cuando algo falle (en cualquier cuenta),
  vemos el error exacto, en qué negocio/usuario, cuándo y cuántas veces, y nos
  avisa. Es tenant-agnóstico: sirve igual antes y después de multi-cliente.
  - *Lo monto yo; requiere que crees una cuenta Sentry (gratis) y me des el DSN.*
- **Panel de tareas/automatizaciones dentro de bolo** — registra cada corrida de
  los procesos automáticos (crons, reportes): qué corrió, cuándo, si salió bien
  o falló y por qué. Es la "sensación n8n" pero sobre bolo. *Se construye
  tenant-aware una vez definido el modelo.*
- **Vercel Observability + logs de Supabase** — ya disponibles, gratis.

## 7. Dónde entra Grok (decisión tomada)

Grok se usa **fuera del producto** (el producto se queda en Claude):

- **Productividad interna del equipo:** Grok como asistente del equipo (redactar,
  resumir, analizar, apoyar soporte). Sostenible sobre todo con X Premium. No
  requiere integración en bolo; es una herramienta que usa el equipo.
- **Triage de monitoreo:** un bot que resuma errores de Sentry/logs y sugiera la
  causa probable, y lo mande al equipo. Se puede hacer con **Grok (API de xAI,
  requiere una API key de xAI)** o reutilizando **Claude** (ya integrado). Se
  decide al construir esta parte; por defecto, lo más sostenible es reutilizar
  Claude, salvo que prefieras Grok explícitamente.

## 8. Riesgos y decisiones abiertas

- **Disciplina de `negocio_id` + RLS:** es la pieza de seguridad; hay que
  probarla bien (que un negocio jamás vea otro).
- **Rol de super-admin:** definir cómo entramos a dar soporte sin romper el
  aislamiento.
- **Facturación:** pasarela y moneda (tema aparte, fase posterior).
- **Triage:** ¿Grok o Claude? (ver §7).

## 9. Roadmap por fases

- **Fase 0 (ya):** Observabilidad base → Sentry + panel de tareas.
- **Fase 1:** Modelo de cuentas (`negocio`, `negocio_usuario`) + primer negocio.
- **Fase 2:** `negocio_id` + RLS en todas las tablas (aislamiento).
- **Fase 3:** Negocio activo en la sesión + onboarding de negocios nuevos.
- **Fase 4:** Panel de super-admin (ver todas las cuentas).
- **Fase 5:** Planes y facturación.
- **Transversal:** Grok para productividad interna + triage de monitoreo.
