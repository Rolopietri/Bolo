// Disposición del Home de cocina.
// Archivo .mjs (sin TypeScript) para probarlo con `node`: scripts/check-modulos.mjs.
//
// El orden guardado vive en restaurante_ajustes.orden_modulos (jsonb):
//   layout: [{ id, col }]  orden en móvil; col 0 = izquierda, 1 = derecha en escritorio
//   pastillas: { inventario: ["stock", ...], ... }
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
      { id: "stock", href: "/cocina/insumos", label: "Inventario", dataGuia: "accion-stock" },
      { id: "uso", href: "/cocina/insumos?vista=uso", label: "Uso diario" },
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
      { id: "produccion", href: "/cocina/produccion", label: "Producción" },
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
 * Ids conocidos, sin repetir y sin basura.
 * @param {unknown} lista
 * @param {Set<string>} conocidos
 * @returns {string[]}
 */
function idsConocidos(lista, conocidos) {
  if (!Array.isArray(lista)) return [];
  /** @type {string[]} */
  const ids = [];
  const vistos = new Set();
  for (const item of lista) {
    if (typeof item !== "string") continue;
    const id = item.trim();
    if (!id || vistos.has(id) || !conocidos.has(id)) continue;
    vistos.add(id);
    ids.push(id);
  }
  return ids;
}

/**
 * Bloques que se pueden mover en el Home. `col` es la columna por defecto
 * en escritorio (0 izquierda, 1 derecha). En móvil se apilan en este orden.
 * @type {readonly { id: string, titulo: string, col: 0 | 1 }[]}
 */
export const BLOQUES_HOME = [
  { id: "aviso", titulo: "Hoy", col: 0 },
  { id: "tasas", titulo: "Tasas", col: 1 },
  { id: "anillo", titulo: "Anillo", col: 0 },
  { id: "inventario", titulo: "Inventario", col: 1 },
  { id: "recetas", titulo: "Recetas", col: 0 },
  { id: "operacion", titulo: "Operación", col: 1 },
];

/**
 * @param {unknown} valor
 * @returns {{ pastillas: Record<string, string[]>, layout: { id: string, col: 0 | 1 }[] | null } | null}
 */
export function normalizarOrdenHome(valor) {
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
  const fila = /** @type {Record<string, unknown>} */ (data);
  const fuente =
    fila.pastillas && typeof fila.pastillas === "object" && !Array.isArray(fila.pastillas)
      ? /** @type {Record<string, unknown>} */ (fila.pastillas)
      : fila;

  /** @type {Record<string, string[]>} */
  const pastillas = {};
  let algunaPastilla = false;
  for (const grupo of GRUPOS_HOME) {
    const ids = idsConocidos(fuente[grupo.id], new Set(grupo.accesos.map((acceso) => acceso.id)));
    if (ids.length > 0) {
      pastillas[grupo.id] = ids;
      algunaPastilla = true;
    }
  }

  const conocidos = new Set(BLOQUES_HOME.map((bloque) => bloque.id));
  const defectoCol = new Map(BLOQUES_HOME.map((bloque) => [bloque.id, bloque.col]));
  /** @type {{ id: string, col: 0 | 1 }[]} */
  const layout = [];
  const vistos = new Set();
  if (Array.isArray(fila.layout)) {
    for (const item of fila.layout) {
      const id = typeof item === "string" ? item.trim() : typeof item?.id === "string" ? item.id.trim() : "";
      if (!id || vistos.has(id) || !conocidos.has(id)) continue;
      const crudo = typeof item === "object" && item ? item.col : defectoCol.get(id);
      vistos.add(id);
      layout.push({ id, col: crudo === 1 ? 1 : 0 });
    }
  }
  if (!algunaPastilla && layout.length === 0) return null;
  return { pastillas, layout: layout.length ? layout : null };
}

/**
 * @param {unknown} valor
 * @returns {Record<string, string[]> | null}
 */
export function normalizarOrdenModulos(valor) {
  const home = normalizarOrdenHome(valor);
  if (!home || Object.keys(home.pastillas).length === 0) return null;
  return home.pastillas;
}

/**
 * Pastillas visibles, en el orden guardado dentro de cada grupo.
 * Las que no están en ese orden (nuevas, o recién prendidas por flag) van al final,
 * en el orden del catálogo. Las ocultas por flag no aparecen, aunque estén guardadas.
 * La clave `grupos` reordena las casillas. Las que no estén en esa lista van al final.
 * @param {string | undefined | null} modulos  valor de BOLO_MODULOS
 * @param {unknown} ordenGuardado
 * @returns {GrupoHome[]}
 */
export function gruposOrdenados(modulos, ordenGuardado) {
  const orden = normalizarOrdenModulos(ordenGuardado);
  const armados = GRUPOS_HOME.map((grupo) => {
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
  return armados;
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
 * Mueve una casilla completa, con sus pastillas. Si el id no está,
 * devuelve el mismo arreglo.
 * @param {GrupoHome[]} grupos
 * @param {string} grupoId
 * @param {number} destino
 * @returns {GrupoHome[]}
 */
export function reordenarCasillas(grupos, grupoId, destino) {
  const ids = grupos.map((grupo) => grupo.id);
  const moved = moverId(ids, grupoId, destino);
  if (moved === ids) return grupos;
  const porId = new Map(grupos.map((grupo) => [grupo.id, grupo]));
  return moved.map((id) => {
    const grupo = porId.get(id);
    if (!grupo) throw new Error(`Casilla desconocida: ${id}`);
    return grupo;
  });
}

/**
 * Bloques visibles. Una casilla de Módulos no aparece si no le queda ninguna pastilla.
 * @param {string | undefined | null} modulos
 * @returns {{ id: string, titulo: string, col: 0 | 1 }[]}
 */
export function bloquesVisibles(modulos) {
  const conPastillas = new Set(gruposOrdenados(modulos, null).map((grupo) => grupo.id));
  return BLOQUES_HOME.filter((bloque) => {
    if (bloque.id === "inventario" || bloque.id === "recetas" || bloque.id === "operacion") {
      return conPastillas.has(bloque.id);
    }
    return true;
  }).map((bloque) => ({ id: bloque.id, titulo: bloque.titulo, col: bloque.col }));
}

/**
 * @param {string | undefined | null} modulos
 * @returns {{ id: string, col: 0 | 1 }[]}
 */
export function layoutDefecto(modulos) {
  return bloquesVisibles(modulos).map((bloque) => ({ id: bloque.id, col: bloque.col }));
}

/**
 * Orden visible. Lo que no esté guardado (bloque nuevo) va al final, en su columna
 * por defecto. Los ids desconocidos u ocultos no aparecen.
 * @param {string | undefined | null} modulos
 * @param {unknown} ordenGuardado
 * @returns {{ id: string, col: 0 | 1 }[]}
 */
export function layoutVisible(modulos, ordenGuardado) {
  const visibles = layoutDefecto(modulos);
  const porId = new Map(visibles.map((bloque) => [bloque.id, bloque]));
  const leido = normalizarOrdenHome(ordenGuardado)?.layout ?? [];
  const usados = new Set();
  /** @type {{ id: string, col: 0 | 1 }[]} */
  const salida = [];
  for (const item of leido) {
    if (!porId.has(item.id) || usados.has(item.id)) continue;
    usados.add(item.id);
    salida.push({ id: item.id, col: item.col === 1 ? 1 : 0 });
  }
  for (const bloque of visibles) {
    if (usados.has(bloque.id)) continue;
    salida.push({ id: bloque.id, col: bloque.col });
  }
  return salida;
}

/**
 * Mueve un bloque dentro del orden (móvil: una sola columna). Conserva su `col`.
 * @param {{ id: string, col: 0 | 1 }[]} layout
 * @param {string} id
 * @param {number} destino
 */
export function moverEnOrden(layout, id, destino) {
  const ids = layout.map((bloque) => bloque.id);
  const moved = moverId(ids, id, destino);
  if (moved === ids) return layout;
  const porId = new Map(layout.map((bloque) => [bloque.id, bloque]));
  return moved.map((itemId) => {
    const bloque = porId.get(itemId);
    if (!bloque) throw new Error(`Bloque desconocido: ${itemId}`);
    return bloque;
  });
}

/**
 * Lleva un bloque a una columna y a un puesto dentro de esa columna (escritorio).
 * El índice es entre los bloques de esa columna, sin contar el que se mueve.
 * @param {{ id: string, col: 0 | 1 }[]} layout
 * @param {string} id
 * @param {0 | 1} col
 * @param {number} indiceEnColumna
 */
export function moverBloque(layout, id, col, indiceEnColumna) {
  const actual = layout.find((bloque) => bloque.id === id);
  if (!actual) return layout;
  const destinoCol = col === 1 ? 1 : 0;
  const sin = layout.filter((bloque) => bloque.id !== id);
  const enColumna = sin.filter((bloque) => bloque.col === destinoCol);
  const to = Math.max(0, Math.min(enColumna.length, Math.trunc(indiceEnColumna)));
  const ancla = enColumna[to];
  const item = { id, col: destinoCol };
  if (!ancla) return [...sin, item];
  const indice = sin.findIndex((bloque) => bloque.id === ancla.id);
  const next = sin.slice();
  next.splice(indice, 0, item);
  if (JSON.stringify(next) === JSON.stringify(layout)) return layout;
  return next;
}

/**
 * Lo que se escribe en la base. Null = disposición por defecto.
 * `layout` solo si los bloques no están en su lugar; `pastillas` solo de los grupos que cambiaron.
 * @param {string | undefined | null} modulos
 * @param {GrupoHome[]} grupos
 * @param {{ id: string, col: 0 | 1 }[] | null | undefined} [layout]
 * @returns {{ layout?: { id: string, col: 0 | 1 }[], pastillas?: Record<string, string[]> } | null}
 */
export function ordenParaGuardar(modulos, grupos, layout) {
  const defecto = gruposOrdenados(modulos, null);
  const pastillasDefecto = new Map(
    defecto.map((grupo) => [grupo.id, grupo.accesos.map((acceso) => acceso.id).join("\0")]),
  );
  /** @type {Record<string, string[]>} */
  const pastillas = {};
  for (const grupo of grupos) {
    const ids = grupo.accesos.map((acceso) => acceso.id);
    if (pastillasDefecto.get(grupo.id) === ids.join("\0")) continue;
    pastillas[grupo.id] = ids;
  }
  /** @type {{ layout?: { id: string, col: 0 | 1 }[], pastillas?: Record<string, string[]> }} */
  const out = {};
  let alguno = false;
  if (layout) {
    const base = layoutDefecto(modulos);
    const limpio = layout.map((bloque) => ({ id: bloque.id, col: bloque.col === 1 ? 1 : 0 }));
    if (JSON.stringify(limpio) !== JSON.stringify(base)) {
      out.layout = limpio;
      alguno = true;
    }
  }
  if (Object.keys(pastillas).length > 0) {
    out.pastillas = pastillas;
    alguno = true;
  }
  return alguno ? out : null;
}
