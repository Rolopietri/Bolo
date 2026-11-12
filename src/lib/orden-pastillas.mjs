// Orden de las pastillas de Módulos en el Home de cocina.
// Archivo .mjs (sin TypeScript) para probarlo con `node`: scripts/check-modulos.mjs.
//
// El orden guardado vive en restaurante_ajustes.orden_modulos, por grupo.
// Si no hay orden, o la columna todavía no existe, se usa el catálogo.

import { funcionActiva } from "./modulos.mjs";

/**
 * @typedef {"planes"} FuncionPastilla
 */

/**
 * @typedef {Object} AccesoHome
 * @property {string} id  estable: es lo que se guarda
 * @property {string} href
 * @property {string} label
 * @property {FuncionPastilla} [funcion]
 * @property {string} [dataGuia]
 */

/**
 * @typedef {Object} GrupoHome
 * @property {string} id
 * @property {string} titulo
 * @property {AccesoHome[]} accesos
 */

/**
 * Catálogo en el orden por defecto. Las pastillas con `funcion` solo se ven
 * si ese id está en BOLO_MODULOS.
 * @type {readonly { id: string, titulo: string, accesos: readonly AccesoHome[] }[]}
 */
export const GRUPOS_HOME = [
  {
    id: "inventario",
    titulo: "Inventario",
    accesos: [
      { id: "insumos", href: "/cocina/insumos", label: "Insumos" },
      { id: "stock", href: "/cocina/inventario/stock", label: "Stock" },
      { id: "conteo", href: "/cocina/inventario/conteo", label: "Conteo" },
      { id: "proveedores", href: "/cocina/proveedores", label: "Proveedores" },
      { id: "menaje", href: "/cocina/menaje", label: "Menaje" },
    ],
  },
  {
    id: "recetas",
    titulo: "Recetas",
    accesos: [
      { id: "recetas", href: "/cocina/recetas", label: "Recetas" },
      { id: "costeo", href: "/cocina/costeo", label: "Costeo" },
      { id: "plato", href: "/cocina/plato", label: "Crear un plato", dataGuia: "guia-plato" },
    ],
  },
  {
    id: "operacion",
    titulo: "Operación",
    accesos: [
      { id: "compras", href: "/cocina/compras", label: "Compras" },
      { id: "ventas", href: "/cocina/ventas", label: "Ventas" },
      { id: "pedido", href: "/cocina/pedido", label: "Pedido sugerido" },
      {
        id: "planes",
        href: "/cocina/inventario/planes",
        label: "Planes de producción",
        funcion: "planes",
      },
    ],
  },
];

/**
 * @param {unknown} valor
 * @returns {Record<string, string[]> | null}
 */
export function normalizarOrdenModulos(valor) {
  let data = valor;
  if (typeof data === "string") {
    const texto = data.trim();
    if (!texto) return null;
    try {
      data = JSON.parse(texto);
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;

  /** @type {Record<string, string[]>} */
  const out = {};
  let alguno = false;
  for (const grupo of GRUPOS_HOME) {
    const lista = /** @type {Record<string, unknown>} */ (data)[grupo.id];
    if (!Array.isArray(lista)) continue;
    /** @type {string[]} */
    const ids = [];
    const vistos = new Set();
    const conocidos = new Set(grupo.accesos.map((a) => a.id));
    for (const item of lista) {
      if (typeof item !== "string") continue;
      const id = item.trim();
      if (!id || vistos.has(id) || !conocidos.has(id)) continue;
      vistos.add(id);
      ids.push(id);
    }
    if (ids.length > 0) {
      out[grupo.id] = ids;
      alguno = true;
    }
  }
  return alguno ? out : null;
}

/**
 * Pastillas visibles, en el orden guardado dentro de cada grupo.
 * Las que no están en ese orden (nuevas, o recién prendidas por flag) van al final,
 * en el orden del catálogo. Las ocultas por flag no aparecen, aunque estén guardadas.
 * @param {string | undefined | null} modulos  valor de BOLO_MODULOS
 * @param {unknown} ordenGuardado
 * @returns {GrupoHome[]}
 */
export function gruposOrdenados(modulos, ordenGuardado) {
  const orden = normalizarOrdenModulos(ordenGuardado);
  return GRUPOS_HOME.map((grupo) => {
    const visibles = grupo.accesos.filter(
      (acceso) => !acceso.funcion || funcionActiva(acceso.funcion, modulos),
    );
    const porId = new Map(visibles.map((acceso) => [acceso.id, acceso]));
    const usados = new Set();
    /** @type {AccesoHome[]} */
    const ordenados = [];
    for (const id of orden?.[grupo.id] ?? []) {
      const acceso = porId.get(id);
      if (!acceso || usados.has(id)) continue;
      usados.add(id);
      ordenados.push(acceso);
    }
    for (const acceso of visibles) {
      if (usados.has(acceso.id)) continue;
      ordenados.push(acceso);
    }
    return { id: grupo.id, titulo: grupo.titulo, accesos: ordenados };
  }).filter((grupo) => grupo.accesos.length > 0);
}

/**
 * @param {string | undefined | null} modulos
 * @param {unknown} ordenGuardado
 * @returns {{ id: string, ids: string[] }[]}
 */
export function idsVisibles(modulos, ordenGuardado) {
  return gruposOrdenados(modulos, ordenGuardado).map((grupo) => ({
    id: grupo.id,
    ids: grupo.accesos.map((acceso) => acceso.id),
  }));
}

/**
 * @param {string | undefined | null} modulos
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
export function mismoOrdenVisible(modulos, a, b) {
  return JSON.stringify(idsVisibles(modulos, a)) === JSON.stringify(idsVisibles(modulos, b));
}

/**
 * Mueve `id` al índice `destino` (en la lista final). No cambia nada si el id
 * no está o si ya está en ese lugar: en ese caso devuelve el mismo arreglo.
 * @param {string[]} ids
 * @param {string} id
 * @param {number} destino
 * @returns {string[]}
 */
export function moverId(ids, id, destino) {
  const desde = ids.indexOf(id);
  if (desde < 0 || !Number.isFinite(destino)) return ids;
  const to = Math.max(0, Math.min(ids.length - 1, Math.trunc(destino)));
  if (desde === to) return ids;
  const next = ids.slice();
  const [item] = next.splice(desde, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * Reordena una pastilla dentro de su grupo. Si el id no pertenece a ese grupo,
 * devuelve el mismo arreglo de grupos.
 * @param {GrupoHome[]} grupos
 * @param {string} grupoId
 * @param {string} id
 * @param {number} destino
 * @returns {GrupoHome[]}
 */
export function reordenarGrupo(grupos, grupoId, id, destino) {
  let cambio = false;
  const next = grupos.map((grupo) => {
    if (grupo.id !== grupoId) return grupo;
    const ids = grupo.accesos.map((acceso) => acceso.id);
    const moved = moverId(ids, id, destino);
    if (moved === ids) return grupo;
    cambio = true;
    const porId = new Map(grupo.accesos.map((acceso) => [acceso.id, acceso]));
    return {
      ...grupo,
      accesos: moved.map((itemId) => {
        const acceso = porId.get(itemId);
        if (!acceso) throw new Error(`Pastilla desconocida: ${itemId}`);
        return acceso;
      }),
    };
  });
  return cambio ? next : grupos;
}

/**
 * Lo que se escribe en la base. Null significa «orden por defecto», así una
 * pastilla nueva entra en su lugar del catálogo y no al final.
 * @param {string | undefined | null} modulos
 * @param {GrupoHome[]} grupos
 * @returns {Record<string, string[]> | null}
 */
export function ordenParaGuardar(modulos, grupos) {
  /** @type {Record<string, string[]>} */
  const explicito = {};
  for (const grupo of grupos) {
    explicito[grupo.id] = grupo.accesos.map((acceso) => acceso.id);
  }
  if (mismoOrdenVisible(modulos, explicito, null)) return null;
  return explicito;
}
