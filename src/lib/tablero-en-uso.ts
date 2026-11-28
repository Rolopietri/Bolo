// Tablero «En uso» de cocina: lo que hay listo en la estación, partido entre
// lo que viene de la jornada anterior y lo habilitado en esta.
//
// Módulo puro (sin React ni Supabase) para probarlo con `node`:
// `npm run test:tablero`. Las filas salen de `cocina_tablero_en_uso()` (ver
// `listTableroEnUso`), la categoría es la MISMA de Inventario (la categoría de
// compra del insumo agrupada con `categoriaVisible`). «Subrecetas» / «Desde
// Producción» solo si el ítem es una receta con `es_subreceta` y tiene saldo
// en uso. `se_procesa` no sirve de sustituto: hoy las recetas no traen stock,
// así que ese grupo no aparece y todo queda bajo «En uso» (desde Almacén).

import type { TableroEnUso } from "@/lib/data/jornada-cocina";
import { categoriaVisible, GRUPOS_CATEGORIA_STOCK, SIN_CATEGORIA_STOCK } from "@/lib/stock-liviano";

/** Lo mínimo del insumo que hace falta para clasificar una fila. */
export type InsumoParaTablero = {
  id: string;
  categoriaCompra?: string | null;
};

/**
 * Receta que podría entrar al tablero como subreceta.
 * Solo cuenta si `esSubreceta` y `cantidadEnUso` > 0. Hoy `recetas` no tiene
 * saldo, así que sin `cantidadEnUso` no aparece. Cuando ese saldo exista se
 * pasa aquí, sin cambiar la pantalla.
 */
export type SubrecetaParaTablero = {
  id: string;
  nombre: string;
  esSubreceta?: boolean | null;
  activo?: boolean | null;
  unidadBase?: string | null;
  /** Unidad de rendimiento de la receta, si no hay `unidadBase`. */
  rendimientoUnidad?: string | null;
  categoriaCompra?: string | null;
  /** Saldo en uso (unidad base). Sin este número la subreceta no entra. */
  cantidadEnUso?: number | null;
  vieneDeAnterior?: number | null;
  habilitadoEsta?: number | null;
  procesadoHabilitado?: number | null;
};

export type ItemEnUso = {
  insumoId: string;
  nombre: string;
  unidadBase: string;
  /** Lo que hay en uso ahora (unidad base). */
  cantidad: number;
  /** Parte que viene de la jornada anterior (verde oscuro). */
  anterior: number;
  /** Parte habilitada en esta jornada (turquesa). */
  hoy: number;
  /** Fracciones del aro (0–1) sobre lo que hubo disponible en la jornada. */
  fillAnterior: number;
  fillHoy: number;
  categoria: string;
  /** Receta con es_subreceta y saldo en uso: va bajo «Subrecetas». */
  deProduccion: boolean;
};

const EPS = 0.0001;

function pos(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Una fila del tablero convertida para dibujar. Devuelve null si no hay nada en uso.
 *  `deProduccion` solo lo enciende quien ya comprobó que la fila es una subreceta real. */
export function itemDeFila(
  fila: TableroEnUso,
  insumo: InsumoParaTablero | undefined,
  deProduccion = false,
): ItemEnUso | null {
  const hoyFila = pos(fila.habilitadoEsta);
  const cantidad = pos(fila.stockProcesado) > 0 ? pos(fila.stockProcesado) : pos(fila.vieneDeAnterior) + hoyFila;
  // Lo de antes nunca pasa de lo que hay ahora.
  const anterior = Math.min(pos(fila.vieneDeAnterior), cantidad);
  // Lo que hubo disponible en la jornada: lo que quedó de antes más lo que entró.
  // Nunca menos que lo que hay ahora (stock viejo sin saldo de apertura).
  const disponible = Math.max(anterior + pos(fila.procesadoHabilitado), cantidad);
  if (disponible <= EPS) return null;
  const fillAnterior = Math.min(1, anterior / disponible);
  const fillHoy = Math.min(1 - fillAnterior, Math.max(0, cantidad - anterior) / disponible);
  return {
    insumoId: fila.insumoId,
    nombre: fila.nombre,
    unidadBase: fila.unidadBase,
    cantidad,
    anterior,
    hoy: Math.max(0, cantidad - anterior),
    fillAnterior,
    fillHoy,
    categoria: categoriaVisible(insumo?.categoriaCompra),
    deProduccion,
  };
}

/** Arma la fila de una subreceta real. Sin saldo (el caso de hoy) devuelve null. */
export function filaDeSubreceta(s: SubrecetaParaTablero): TableroEnUso | null {
  if (!s.esSubreceta || s.activo === false) return null;
  const cantidad = pos(s.cantidadEnUso ?? NaN);
  if (cantidad <= EPS) return null;
  const anterior = Math.min(pos(s.vieneDeAnterior ?? 0), cantidad);
  const hoy = s.habilitadoEsta == null ? Math.max(0, cantidad - anterior) : pos(s.habilitadoEsta);
  return {
    insumoId: s.id,
    nombre: s.nombre,
    unidadBase: s.unidadBase || s.rendimientoUnidad || "",
    stockActual: 0,
    stockProcesado: cantidad,
    vieneDeAnterior: anterior,
    habilitadoEsta: hoy,
    procesadoHabilitado: s.procesadoHabilitado == null ? hoy : pos(s.procesadoHabilitado),
    jornadaId: null,
    jornadaIniciadoAt: null,
    pendientesAbiertos: 0,
    lotesPendientes: 0,
  };
}

/** Filas del tablero → aros, ordenados por nombre.
 *  Los insumos nunca son subreceta (aunque `se_procesa`). Las subrecetas entran
 *  solo por `subrecetas`, y solo si son recetas con es_subreceta y saldo. */
export function armarItemsEnUso(
  filas: TableroEnUso[],
  insumos: InsumoParaTablero[],
  subrecetas: SubrecetaParaTablero[] = [],
): ItemEnUso[] {
  const porId = new Map(insumos.map((i) => [i.id, i]));
  const items: ItemEnUso[] = [];
  for (const f of filas) {
    const it = itemDeFila(f, porId.get(f.insumoId), false);
    if (it) items.push(it);
  }
  for (const s of subrecetas) {
    const fila = filaDeSubreceta(s);
    if (!fila) continue;
    const it = itemDeFila(
      fila,
      { id: s.id, categoriaCompra: s.categoriaCompra },
      true,
    );
    if (it) items.push(it);
  }
  return items.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

const ORDEN = new Map<string, number>(GRUPOS_CATEGORIA_STOCK.map((g, i) => [g, i]));
ORDEN.set(SIN_CATEGORIA_STOCK, GRUPOS_CATEGORIA_STOCK.length);

/** Categorías con algo en uso, en el orden de Inventario. */
export function categoriasEnUso(items: ItemEnUso[]): string[] {
  const set = new Set(items.map((i) => i.categoria));
  return [...set].sort((a, b) => (ORDEN.get(a) ?? 99) - (ORDEN.get(b) ?? 99) || a.localeCompare(b, "es"));
}

/** Subrecetas reales en uso (desde Producción) y el resto (directo del almacén). */
export function partirPorOrigen(items: ItemEnUso[]): { subrecetas: ItemEnUso[]; directo: ItemEnUso[] } {
  return {
    subrecetas: items.filter((i) => i.deProduccion),
    directo: items.filter((i) => !i.deProduccion),
  };
}

/**
 * Tamaño del aro (px) según el ancho disponible y cuántos hay: con pocos se
 * ven grandes, con muchos se achican y pasan a más filas, sin bajar de `minS`.
 */
export function tamanioAro(ancho: number, n: number, maxS: number, minS: number, gap: number): number {
  const count = Math.max(1, n);
  const w = Math.max(minS, ancho);
  const unaFila = (w - gap * (count - 1)) / count;
  if (unaFila >= minS) return Math.min(maxS, unaFila);
  const cols = Math.max(1, Math.floor((w + gap) / (minS + gap)));
  return Math.min(maxS, Math.max(minS, (w - gap * (cols - 1)) / cols));
}
