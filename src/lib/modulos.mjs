// Módulos del menú inicial
// ═══════════════════════════════════════════════════════════════════
// Bolo arranca con Cocina y Administración. Tareas, Eventos, Presupuestos y
// WiFi vienen de la app interna de Quinta Mamá: se retiran del menú, pero sus
// rutas, tablas y datos siguen intactos (se puede entrar por URL directa).
//
// Mientras no exista la configuración del negocio en la base (entrega E2), la
// lista activa se puede cambiar por despliegue con la variable de servidor
// BOLO_MODULOS (ids separados por coma, p. ej. "cocina,administracion,tareas").
// Sin variable, o si no trae ningún id válido, se usa la lista por defecto.
//
// Archivo .mjs (sin TypeScript) para poder probarlo con `node` directamente:
// ver scripts/check-modulos.mjs.

/** @typedef {"cocina" | "administracion" | "marketplace" | "tareas" | "eventos" | "presupuestos" | "wifi"} ModuloId */

/**
 * Catálogo en el orden en que se muestran.
 * @type {readonly { id: ModuloId, href: string, title: string, desc: string }[]}
 */
export const MODULOS = [
  { id: "cocina", href: "/cocina", title: "Cocina", desc: "Insumos, recetas y compras." },
  { id: "administracion", href: "/administracion", title: "Administración", desc: "Cuentas y dinero." },
  { id: "marketplace", href: "/marketplace", title: "Mercado", desc: "Proveedores, equipos y reventa." },
  { id: "tareas", href: "/tareas", title: "Tareas", desc: "Lo que hay que hacer." },
  { id: "eventos", href: "/eventos", title: "Eventos", desc: "Próximos eventos." },
  { id: "presupuestos", href: "/presupuestos", title: "Presupuestos", desc: "Cotizaciones y precios." },
  { id: "wifi", href: "/admin/wifi", title: "WiFi", desc: "Clave del WiFi y clientes." },
];

/** @type {readonly ModuloId[]} */
export const MODULOS_POR_DEFECTO = ["cocina", "administracion", "marketplace"];

/**
 * Ids activos, en el orden del catálogo, a partir del valor de BOLO_MODULOS.
 * Ignora ids desconocidos, espacios, mayúsculas y repetidos.
 * @param {string | undefined | null} valor
 * @returns {ModuloId[]}
 */
export function modulosActivos(valor) {
  const pedidos = new Set(
    (valor ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  const validos = MODULOS.filter((m) => pedidos.has(m.id)).map((m) => m.id);
  if (validos.length === 0) return [...MODULOS_POR_DEFECTO];
  return validos;
}

/**
 * ¿Está activo un módulo? Lo usan las rutas de los módulos retirados (p. ej.
 * WiFi) para responder "no encontrado" cuando no están en BOLO_MODULOS.
 * @param {ModuloId} id
 * @param {string | undefined | null} valor  valor de BOLO_MODULOS
 * @returns {boolean}
 */
export function moduloActivo(id, valor) {
  return modulosActivos(valor).includes(id);
}

// ── Funciones opcionales dentro de un módulo ────────────────────────
// No son tarjetas del inicio: son partes de un módulo que Bolo retira por
// defecto. Se reactivan agregando su id a la misma variable BOLO_MODULOS
// (p. ej. "cocina,administracion,planes"). Sus tablas y funciones de la base
// siguen intactas.

/** @typedef {"planes"} FuncionId */

/**
 * @type {readonly { id: FuncionId, titulo: string }[]}
 */
export const FUNCIONES = [
  // Planes de producción (Cocina · M5): reservan stock para producciones
  // planificadas. Retirados de Bolo el 2026-10-03.
  { id: "planes", titulo: "Planes de producción" },
];

/**
 * ¿Está activa una función opcional? Apagada salvo que su id esté en BOLO_MODULOS.
 * @param {FuncionId} id
 * @param {string | undefined | null} valor  valor de BOLO_MODULOS
 * @returns {boolean}
 */
export function funcionActiva(id, valor) {
  if (!FUNCIONES.some((f) => f.id === id)) return false;
  return (valor ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .includes(id);
}
