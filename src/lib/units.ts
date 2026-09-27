// Conversión de unidades para cocina.
//
// El sistema de insumos guarda `unidadBase` como texto libre — pero al usar el
// insumo en una receta el usuario quiere poder escribir la cantidad en CUALQUIER
// unidad equivalente (kg cuando el insumo está en g, ml cuando está en L, etc.).
// Este módulo mapea cada unidad a una dimensión + factor hacia una base canónica
// para que la conversión sea bidireccional.
//
// Dimensiones soportadas:
//   • peso    → base g
//   • volumen → base ml
//   • conteo  → base unidad (sin conversión real, solo aliases)
//
// Las unidades NO listadas (ej "taza", "saco", "tira") quedan como dimensión
// "desconocida" — la app las trata como literales (no convierte). Eso preserva
// el comportamiento de toda la data ya cargada.

export type Dimension = "peso" | "volumen" | "conteo" | "desconocida";

type UnitInfo = {
  /** Factor hacia la unidad base de la dimensión (ej. 1 kg = 1000 g → toBase = 1000). */
  toBase: number;
  dimension: Dimension;
  /** Forma canónica corta para mostrar al usuario. */
  canonica: string;
};

/** Diccionario alias → info. Las claves se normalizan en lower-case + sin tildes. */
const UNITS: Record<string, UnitInfo> = {
  // ── Peso (base: g) ─────────────────────────────────────────
  g: { toBase: 1, dimension: "peso", canonica: "g" },
  gr: { toBase: 1, dimension: "peso", canonica: "g" },
  grs: { toBase: 1, dimension: "peso", canonica: "g" },
  gramo: { toBase: 1, dimension: "peso", canonica: "g" },
  gramos: { toBase: 1, dimension: "peso", canonica: "g" },
  kg: { toBase: 1000, dimension: "peso", canonica: "kg" },
  kgs: { toBase: 1000, dimension: "peso", canonica: "kg" },
  kilo: { toBase: 1000, dimension: "peso", canonica: "kg" },
  kilos: { toBase: 1000, dimension: "peso", canonica: "kg" },
  kilogramo: { toBase: 1000, dimension: "peso", canonica: "kg" },
  kilogramos: { toBase: 1000, dimension: "peso", canonica: "kg" },
  mg: { toBase: 0.001, dimension: "peso", canonica: "mg" },
  miligramo: { toBase: 0.001, dimension: "peso", canonica: "mg" },
  miligramos: { toBase: 0.001, dimension: "peso", canonica: "mg" },

  // ── Volumen (base: ml) ─────────────────────────────────────
  ml: { toBase: 1, dimension: "volumen", canonica: "ml" },
  mililitro: { toBase: 1, dimension: "volumen", canonica: "ml" },
  mililitros: { toBase: 1, dimension: "volumen", canonica: "ml" },
  cc: { toBase: 1, dimension: "volumen", canonica: "ml" },
  l: { toBase: 1000, dimension: "volumen", canonica: "L" },
  lt: { toBase: 1000, dimension: "volumen", canonica: "L" },
  lts: { toBase: 1000, dimension: "volumen", canonica: "L" },
  litro: { toBase: 1000, dimension: "volumen", canonica: "L" },
  litros: { toBase: 1000, dimension: "volumen", canonica: "L" },

  // ── Conteo (base: unidad) ──────────────────────────────────
  // Solo aliases — no hay conversión real, pero permite que "u" se trate
  // como equivalente a "unidad" cuando se compara.
  unidad: { toBase: 1, dimension: "conteo", canonica: "unidad" },
  unidades: { toBase: 1, dimension: "conteo", canonica: "unidad" },
  u: { toBase: 1, dimension: "conteo", canonica: "unidad" },
  und: { toBase: 1, dimension: "conteo", canonica: "unidad" },
  pza: { toBase: 1, dimension: "conteo", canonica: "unidad" },
  pzas: { toBase: 1, dimension: "conteo", canonica: "unidad" },
  pieza: { toBase: 1, dimension: "conteo", canonica: "unidad" },
  piezas: { toBase: 1, dimension: "conteo", canonica: "unidad" },
  porcion: { toBase: 1, dimension: "conteo", canonica: "porción" },
  porciones: { toBase: 1, dimension: "conteo", canonica: "porción" },
  "porción": { toBase: 1, dimension: "conteo", canonica: "porción" },
};

/** Normaliza: trim, lowercase, sin acentos. */
function normalize(unidad: string): string {
  return unidad
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Devuelve info de la unidad si la conocemos, null si no. */
export function getUnit(unidad: string | undefined | null): UnitInfo | null {
  if (!unidad) return null;
  return UNITS[normalize(unidad)] ?? null;
}

export function dimension(unidad: string | undefined | null): Dimension {
  return getUnit(unidad)?.dimension ?? "desconocida";
}

/** Cantidad expresada en la unidad base de su dimensión (g, ml o unidad).
 *  Sirve para comparar/ordenar ingredientes aunque estén en unidades distintas
 *  (ej. 1 Kg = 1000 > 200 g). Si la unidad es desconocida, usa la cantidad tal
 *  cual. */
export function cantidadEnBase(
  cantidad: number,
  unidad: string | undefined | null,
): number {
  return cantidad * (getUnit(unidad)?.toBase ?? 1);
}

/** Ordena ingredientes (o cualquier item con cantidad+unidad) de MAYOR a MENOR
 *  cantidad, comparando en unidad base. No muta el arreglo original. */
export function ordenarPorCantidadDesc<
  T extends { cantidad: number; unidad: string },
>(items: T[]): T[] {
  return [...items].sort(
    (a, b) =>
      cantidadEnBase(b.cantidad, b.unidad) -
      cantidadEnBase(a.cantidad, a.unidad),
  );
}

/** Forma canónica si la conocemos (ej "Kilos" → "kg"); si no, devuelve el original. */
export function canonica(unidad: string): string {
  return getUnit(unidad)?.canonica ?? unidad;
}

/** Número formateado: redondea a `maxDec` y quita ceros sobrantes (con punto). */
function fmtNum(n: number, maxDec: number): string {
  return Number(n.toFixed(maxDec)).toString();
}

/**
 * Formato de cantidad para MOSTRAR en pantalla (solo visual — no cambia datos).
 * Si el monto es chico y la unidad base es Kg o L, lo muestra en g o ml para
 * que no se pierda precisión al redondear (ej. 0.065 Kg → "65 g"). En montos
 * grandes deja la unidad original (ej. 2.5 Kg). El cálculo interno siempre
 * sigue en la unidad base.
 */
export function displayCantidad(
  value: number,
  unidadBase: string | undefined | null,
): string {
  const info = getUnit(unidadBase);
  const abs = Math.abs(value);
  if (info && abs > 0 && abs < 1) {
    if (info.canonica === "kg") return `${fmtNum(value * 1000, 1)} g`;
    if (info.canonica === "L") return `${fmtNum(value * 1000, 1)} ml`;
  }
  return `${fmtNum(value, 3)} ${unidadBase ?? ""}`.trim();
}

/** True si dos unidades pertenecen a la misma dimensión Y son conocidas. */
export function areCompatible(u1: string | undefined | null, u2: string | undefined | null): boolean {
  const a = getUnit(u1);
  const b = getUnit(u2);
  return !!(a && b && a.dimension === b.dimension);
}

/**
 * Convierte una cantidad de `from` a `to`.
 * Retorna null si las unidades no son compatibles o desconocidas.
 *
 * Si `from` y `to` normalizan al mismo alias, retorna la cantidad sin tocar
 * (sirve como fast-path).
 */
export function convert(
  cantidad: number,
  from: string | undefined | null,
  to: string | undefined | null,
): number | null {
  const f = getUnit(from);
  const t = getUnit(to);
  if (!f || !t) return null;
  if (f.dimension !== t.dimension) return null;
  // cantidad (from) → base = cantidad * f.toBase
  // base → to       = base / t.toBase
  return (cantidad * f.toBase) / t.toBase;
}

/**
 * Devuelve la cantidad equivalente en la unidad base del insumo, o null si no
 * es posible. Útil para el cálculo de costo: si el insumo está en kg y la receta
 * pide en g, esto convierte 250g → 0.25 kg para multiplicar por el precio/kg.
 *
 * Si las unidades son strings que coinciden exactamente (ignorando case y
 * normalización), también devuelve la cantidad sin modificar — esto cubre las
 * unidades custom no listadas en UNITS (ej "taza", "saco") para no romper
 * data existente.
 */
export function convertirParaCosto(
  cantidad: number,
  unidadIngrediente: string,
  unidadInsumoBase: string,
): { resultado: number; usoFallback: boolean } | null {
  // Fast-path: misma unidad textual (incluye custom no mapeadas)
  if (normalize(unidadIngrediente) === normalize(unidadInsumoBase)) {
    return { resultado: cantidad, usoFallback: false };
  }
  const c = convert(cantidad, unidadIngrediente, unidadInsumoBase);
  if (c !== null) return { resultado: c, usoFallback: false };
  // No se pudo convertir: caemos al fallback de asumir la misma unidad
  // (comportamiento histórico). El consumidor puede usar `usoFallback`
  // para mostrar un warning.
  return { resultado: cantidad, usoFallback: true };
}

/** Unidades comunes para datalists / autocomplete. */
export const UNIDADES_COMUNES = [
  "g",
  "kg",
  "mg",
  "ml",
  "L",
  "unidad",
  "porción",
];

/**
 * Junta las unidades DISTINTAS que ya aparecen en los datos, SEPARADAS por tipo:
 *   • `base`   → unidades base (de insumos, y de recetas: ingredientes y
 *                rendimiento). Ej: g, ml, unidad, "scoops".
 *   • `compra` → unidades de compra de insumos. Ej: kg, "botella", "paq 12".
 *
 * Se mantienen separadas a propósito: el desplegable de "unidad base" NO debe
 * mostrar unidades de compra ni viceversa. Unifica duplicados por
 * mayúsculas/acentos y no requiere mantener listas a mano.
 */
export function unidadesEnUso(
  insumos: { unidadBase?: string | null; unidadCompra?: string | null }[] = [],
  recetas: {
    rendimientoUnidad?: string | null;
    ingredientes?: { unidad?: string | null }[];
  }[] = [],
): { base: string[]; compra: string[] } {
  const base = new Map<string, string>(); // clave normalizada → texto a mostrar
  const compra = new Map<string, string>();
  const add = (map: Map<string, string>, u?: string | null) => {
    const t = (u ?? "").trim();
    if (!t) return;
    // Canonizar unidades conocidas ("unidades"→"unidad", "grs"→"g", "Kilos"→
    // "kg") para no mostrar la misma unidad escrita de dos formas. Las custom
    // (scoops, botella) quedan tal cual.
    const c = canonica(t);
    const clave = normalize(c);
    if (!map.has(clave)) map.set(clave, c);
  };
  for (const i of insumos) {
    add(base, i.unidadBase);
    add(compra, i.unidadCompra);
  }
  for (const r of recetas) {
    add(base, r.rendimientoUnidad);
    if (r.ingredientes) for (const ing of r.ingredientes) add(base, ing.unidad);
  }
  const ordenar = (m: Map<string, string>) =>
    Array.from(m.values()).sort((a, b) =>
      a.localeCompare(b, "es", { sensitivity: "base" }),
    );
  return { base: ordenar(base), compra: ordenar(compra) };
}
