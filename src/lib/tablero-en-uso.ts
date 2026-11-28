// Tablero «En uso» de cocina: lo que hay listo en la estación, partido entre
// lo que viene de la jornada anterior y lo habilitado en esta.
//
// Módulo puro (sin React ni Supabase) para probarlo con `node`:
// `npm run test:tablero`. Las filas salen de `cocina_tablero_en_uso()` (ver
// `listTableroEnUso`), la categoría es la MISMA de Inventario (la categoría de
// compra del insumo agrupada con `categoriaVisible`) y «viene de Producción»
// sale de `insumos.se_procesa`.

import type { TableroEnUso } from "@/lib/data/jornada-cocina";
import { categoriaVisible, GRUPOS_CATEGORIA_STOCK, SIN_CATEGORIA_STOCK } from "@/lib/stock-liviano";

/** Lo mínimo del insumo que hace falta para clasificar una fila. */
export type InsumoParaTablero = {
  id: string;
  categoriaCompra?: string | null;
  seProcesa?: boolean | null;
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
  /** Pasó por Producción (se procesa): va bajo «Subrecetas». */
  deProduccion: boolean;
};

const EPS = 0.0001;

function pos(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Una fila del tablero convertida para dibujar. Devuelve null si no hay nada en uso. */
export function itemDeFila(fila: TableroEnUso, insumo: InsumoParaTablero | undefined): ItemEnUso | null {
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
    deProduccion: !!insumo?.seProcesa,
  };
}

/** Filas del tablero → aros, ordenados por nombre. */
export function armarItemsEnUso(filas: TableroEnUso[], insumos: InsumoParaTablero[]): ItemEnUso[] {
  const porId = new Map(insumos.map((i) => [i.id, i]));
  const items: ItemEnUso[] = [];
  for (const f of filas) {
    const it = itemDeFila(f, porId.get(f.insumoId));
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

/** Subrecetas (vienen de Producción) y el resto (directo del almacén). */
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
