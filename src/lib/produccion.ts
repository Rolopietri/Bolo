// Registro de producción: merma real por lote, comparación con la merma
// estándar de la ficha, cuadre con lo que dicen las ventas y lectura de la
// plantilla impresa (escaneada con la cámara).

import { convert, getUnit } from "@/lib/units";
import { sugerirInsumo } from "@/lib/facturas/parser";

export type LoteProduccion = {
  id: string;
  fecha: string;
  insumoId: string;
  /** Unidad base del insumo. */
  tomada: number;
  util: number;
  responsable: string | null;
  notas: string | null;
  origen: "manual" | "escaneo" | "telegram";
};

/** Merma real de un lote, en % (0–100). */
export function mermaReal(tomada: number, util: number): number | null {
  if (!(tomada > 0) || util < 0 || util > tomada) return null;
  return ((tomada - util) / tomada) * 100;
}

/** Margen (en puntos) dentro del cual la merma real "se cumple". */
export const MARGEN_MERMA = 5;

export type EstadoMerma = "cumple" | "peor" | "mejor" | "sin_estandar";

export function compararMerma(real: number, estandar: number | null | undefined): EstadoMerma {
  if (estandar == null) return "sin_estandar";
  if (real > estandar + MARGEN_MERMA) return "peor";
  if (real < estandar - MARGEN_MERMA) return "mejor";
  return "cumple";
}

export type ResumenMerma = {
  insumoId: string;
  lotes: LoteProduccion[];
  tomada: number;
  util: number;
  /** Merma real ponderada del período. */
  real: number;
};

export function resumirMerma(lotes: LoteProduccion[]): ResumenMerma[] {
  const map = new Map<string, LoteProduccion[]>();
  for (const l of lotes) {
    const arr = map.get(l.insumoId) ?? [];
    arr.push(l);
    map.set(l.insumoId, arr);
  }
  const out: ResumenMerma[] = [];
  for (const [insumoId, ls] of map) {
    const tomada = ls.reduce((s, l) => s + l.tomada, 0);
    const util = ls.reduce((s, l) => s + l.util, 0);
    out.push({ insumoId, lotes: ls, tomada, util, real: mermaReal(tomada, util) ?? 0 });
  }
  return out;
}

/** Margen (%) dentro del cual lo producido y lo vendido "cuadran". */
export const MARGEN_CUADRE = 10;

export type EstadoCuadre = "cuadra" | "sobra" | "falta";

/** Compara lo útil producido con lo que las ventas dicen que se usó. */
export function compararCuadre(producido: number, usadoVentas: number): { estado: EstadoCuadre; diferencia: number } {
  const diferencia = producido - usadoVentas;
  const base = Math.max(producido, usadoVentas);
  if (!(base > 0) || Math.abs(diferencia) / base <= MARGEN_CUADRE / 100) return { estado: "cuadra", diferencia };
  return { estado: diferencia > 0 ? "sobra" : "falta", diferencia };
}

/** Unidad en que se escribe un insumo en la plantilla: la legible (kg, L) si
 *  su base es g o ml; si no, la base. `factor` pasa de esa unidad a la base. */
export function unidadPlantilla(unidadBase: string): { unidad: string; factor: number } {
  const c = getUnit(unidadBase)?.canonica;
  if (c === "g") return { unidad: "kg", factor: 1000 };
  if (c === "ml") return { unidad: "L", factor: 1000 };
  if (c === "unidad") return { unidad: "unid", factor: 1 };
  return { unidad: unidadBase, factor: 1 };
}

export type RenglonLeido = {
  /** "" si se leyeron números pero no se reconoció el nombre del insumo. */
  insumoId: string;
  /** En la unidad de la plantilla (ver unidadPlantilla). */
  tomada: number | null;
  util: number | null;
  /** Mensajes de chat: el nombre tal como se escribió (para avisar si no se reconoce). */
  leido?: string;
  /** Mensajes de chat: la entrada vino con palabra clave ("Entrando", "Sin procesar"). */
  entradaExplicita?: boolean;
  /** Mensajes de chat: pérdida ("se dañaron") o devolución al almacén; la cantidad va en `util`. */
  especial?: "perdida" | "devolucion";
  motivo?: "perdida" | "mal_estado" | "vencimiento";
  /** Mensajes de chat: el nombre coincide con varios insumos (no se elige uno). */
  ambiguos?: string[];
  /** Mensajes de chat: unidad que no se puede convertir ("2 tazas"). */
  unidadRara?: string;
};

/** Un trozo de texto leído de la foto y su posición (ver leerTrozos en el OCR). */
export type TrozoPlantilla = { texto: string; x0: number; x1: number; y: number; alto: number };

const RE_NUMERO = /^\d+(?:[.,]\d+)?$/;

/**
 * Lee la plantilla escaneada a partir de los trozos de texto y su posición.
 * Las palabras impresas a la misma altura forman un renglón; si su texto es el
 * nombre de un insumo, los números escritos a mano a la derecha y a esa misma
 * altura son, de izquierda a derecha, lo que se tomó y lo que quedó útil.
 * Ubicar por posición (y no por "línea leída") evita que la escritura
 * inclinada mezcle números de renglones vecinos. Lo leído siempre se revisa.
 */
export function leerPlantilla<T extends { id: string; nombre: string }>(
  trozos: TrozoPlantilla[],
  insumos: T[],
): { fecha: string | null; responsable: string | null; renglones: RenglonLeido[] } {
  const numeros = trozos.filter((t) => RE_NUMERO.test(t.texto.trim()));
  const textos = trozos.filter((t) => !RE_NUMERO.test(t.texto.trim())).sort((a, b) => a.y - b.y);
  const altoTipico =
    [...trozos].map((t) => t.alto).sort((a, b) => a - b)[Math.floor(trozos.length / 2)] || 20;

  // Renglones impresos: textos a la misma altura.
  type Banda = { y: number; alto: number; ts: TrozoPlantilla[] };
  const bandas: Banda[] = [];
  for (const t of textos) {
    const b = bandas.find((x) => Math.abs(x.y - t.y) < altoTipico * 0.6);
    if (b) {
      b.ts.push(t);
      b.y = b.ts.reduce((s, x) => s + x.y, 0) / b.ts.length;
      b.alto = Math.max(b.alto, t.alto);
    } else bandas.push({ y: t.y, alto: t.alto, ts: [t] });
  }

  let fecha: string | null = null;
  let responsable: string | null = null;
  const filas: { insumoId: string; y: number; alto: number; finNombre: number }[] = [];
  const vistos = new Set<string>();
  for (const b of bandas) {
    const ordenados = [...b.ts].sort((a, c) => a.x0 - c.x0);
    const texto = ordenados.map((t) => t.texto).join(" ");
    const f = texto.match(/(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{2,4})/);
    const r = texto.match(/responsable\s*[:.]?\s*([^0-9]+?)\s*$/i);
    if (/fecha|responsable/i.test(texto)) {
      if (!fecha && f) {
        const anio = f[3].length === 2 ? `20${f[3]}` : f[3];
        fecha = `${anio}-${f[2].padStart(2, "0")}-${f[1].padStart(2, "0")}`;
      }
      if (!responsable && r) responsable = r[1].replace(/[_.]+$/, "").trim() || null;
      continue;
    }
    const ins = sugerirInsumo(texto, insumos);
    if (!ins || vistos.has(ins.id)) continue;
    vistos.add(ins.id);
    filas.push({ insumoId: ins.id, y: b.y, alto: b.alto, finNombre: Math.max(...ordenados.map((t) => t.x1)) });
  }

  // Cada número escrito va al renglón de insumo más cercano en altura. Los que
  // no tienen renglón reconocido (el nombre salió ilegible) no se pierden: se
  // agrupan por altura y van a revisión con el insumo en blanco.
  const porFila = new Map<string, TrozoPlantilla[]>();
  const sueltos: TrozoPlantilla[] = [];
  for (const n of numeros) {
    let mejor: (typeof filas)[number] | null = null;
    let dist = Infinity;
    for (const fila of filas) {
      const d = Math.abs(fila.y - n.y);
      if (d < Math.max(fila.alto, altoTipico) * 1.1 && d < dist && n.x0 >= fila.finNombre - altoTipico) {
        mejor = fila;
        dist = d;
      }
    }
    if (!mejor) {
      sueltos.push(n);
      continue;
    }
    const arr = porFila.get(mejor.insumoId) ?? [];
    arr.push(n);
    porFila.set(mejor.insumoId, arr);
  }

  const renglones: RenglonLeido[] = [];
  for (const fila of filas) {
    const nums = (porFila.get(fila.insumoId) ?? [])
      .sort((a, b) => a.x0 - b.x0)
      .map((t) => Number(t.texto.trim().replace(",", ".")))
      .filter((n) => Number.isFinite(n));
    if (nums.length === 0) continue;
    renglones.push({ insumoId: fila.insumoId, tomada: nums[0] ?? null, util: nums[1] ?? null });
  }

  // Números sueltos por debajo del encabezado: un renglón por altura.
  const yTabla = filas.length > 0 ? Math.min(...filas.map((f) => f.y)) - altoTipico * 2 : -Infinity;
  const grupos: TrozoPlantilla[][] = [];
  for (const n of sueltos.filter((t) => t.y > yTabla).sort((a, b) => a.y - b.y)) {
    const g = grupos.find((x) => Math.abs(x[0].y - n.y) < altoTipico);
    if (g) g.push(n);
    else grupos.push([n]);
  }
  for (const g of grupos) {
    const nums = g
      .sort((a, b) => a.x0 - b.x0)
      .map((t) => Number(t.texto.trim().replace(",", ".")))
      .filter((n) => Number.isFinite(n));
    // Un solo número suelto suele ser ruido (un número del encabezado, etc.).
    if (nums.length >= 2) renglones.push({ insumoId: "", tomada: nums[0], util: nums[1] ?? null });
  }
  return { fecha, responsable, renglones };
}

// Número con unidad opcional, tal como se escribe en un chat: "10 kg", "6,2",
// "800gr", "3 lts", "12 und".
// Presentaciones de compra ("1 caja", "2 paquetes"): su tamaño sale de la
// presentación de cada insumo (unidad_compra + cantidad_por_compra).
const PRESENTACIONES =
  "cajas?|paquetes?|bultos?|sacos?|bolsas?|botellas?|garrafas?|latas?|frascos?|potes?|bandejas?|cart[oó]n(?:es)?|docenas?|rollos?|piezas?|cestas?|gal[oó]n(?:es)?|bid[oó]n(?:es)?|tarros?|pacas?|fardos?";
const RE_PRESENTACION = new RegExp(`^(${PRESENTACIONES})$`, "i");
const RE_CANTIDAD = new RegExp(
  `(\\d+(?:[.,]\\d+)?)\\s*(?:de\\s+)?(${PRESENTACIONES}|libras?|lbs?|onzas?|oz|kilogramos?|kilos?|kgs?|k|gramos?|grs?|g|litros?|lts?|l|ml|unidades|unid|und|uds?|u)?(?![a-záéíóúñ])`,
  "gi",
);

// "una caja", "dos paquetes", "media caja", "tres kilos" → número.
const NUMEROS: Record<string, string> = {
  un: "1", una: "1", uno: "1", dos: "2", tres: "3", cuatro: "4", cinco: "5", seis: "6",
  siete: "7", ocho: "8", nueve: "9", diez: "10", media: "0.5", medio: "0.5",
};
const RE_NUMERO_PALABRA = new RegExp(
  `(?<![a-záéíóúñ])(${Object.keys(NUMEROS).join("|")})(?=\\s+(?:${PRESENTACIONES}|kilos?|kg|litros?|unidades|gramos?))`,
  "gi",
);
// Fracciones antes de una presentación o unidad: "un cuarto de caja",
// "tres cuartos de kilo", "un tercio de paquete", "1/4 de caja".
const UNIDAD_SIGUE = `(?=\\s+(?:de\\s+)?(?:${PRESENTACIONES}|kilos?|kg|litros?|lts?|unidades|unid|gramos?|grs?))`;
const FRACCIONES: Record<string, number> = { cuarto: 1 / 4, tercio: 1 / 3, octavo: 1 / 8, medio: 1 / 2 };
const RE_FRACCION_PALABRA = new RegExp(
  `(?<![a-záéíóúñ])(?:(${Object.keys(NUMEROS).join("|")}|\\d+)\\s+)?(cuarto|tercio|octavo|medio)s?${UNIDAD_SIGUE}`,
  "gi",
);
const RE_FRACCION_CIFRAS = new RegExp(`(?<![\\d/])(\\d+)\\s*/\\s*(\\d+)${UNIDAD_SIGUE}`, "gi");
const redondeo = (n: number) => String(Math.round(n * 10000) / 10000);
// Números en palabras de dos a cien ("quince panes", "treinta y cinco"). Se
// convierten solo en líneas de movimiento (con palabra clave), para no tocar
// la conversación.
const UNIDADES_N: Record<string, number> = {
  uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
};
const SUELTOS_N: Record<string, number> = {
  dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
  trece: 13, catorce: 14, quince: 15, dieciseis: 16, dieciséis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
  veinte: 20, veintiuno: 21, veintiuna: 21, veintidos: 22, veintidós: 22, veintitres: 23, veintitrés: 23,
  veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintiséis: 26, veintisiete: 27, veintiocho: 28,
  veintinueve: 29, cien: 100, ciento: 100,
};
const DECENAS_N: Record<string, number> = {
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
};
const RE_DECENA = new RegExp(
  `(?<![a-záéíóúñ])(${Object.keys(DECENAS_N).join("|")})(?:\\s+y\\s+(${Object.keys(UNIDADES_N).join("|")}))?(?![a-záéíóúñ])`,
  "gi",
);
const RE_SUELTO = new RegExp(`(?<![a-záéíóúñ])(${Object.keys(SUELTOS_N).join("|")})(?![a-záéíóúñ])`, "gi");
// "un/una" justo después de la palabra clave: "Saliendo un pan".
const RE_UN_TRAS_CLAVE = /((?:entrando|saliendo|entra|sale|entr[oó]|sali[oó]|devolviendo|devuelvo)\s+)(un|una)(?![a-záéíóúñ])/gi;
// "1 kilo y medio", "kilo y medio", "un paquete y cuarto".
const UNIDAD_Y = `${PRESENTACIONES}|kilos?|kgs?|litros?|libras?`;
const RE_Y_FRACCION_CON_N = new RegExp(
  `(\\d+(?:[.,]\\d+)?)\\s*(?:de\\s+)?(${UNIDAD_Y})\\s+y\\s+(medio|media|cuarto)(?![a-záéíóúñ])`,
  "gi",
);
const RE_Y_FRACCION_SOLA = new RegExp(`(?<![\\d.,]\\s{0,3})(?<![a-záéíóúñ])(${UNIDAD_Y})\\s+y\\s+(medio|media|cuarto)(?![a-záéíóúñ])`, "gi");
const fraccionY = (f: string) => (/^cuarto$/i.test(f) ? 0.25 : 0.5);
// Abreviaturas al inicio de la línea: "ent 8 kg lomito", "sal 6 kg lomito".
// ("sal" solo si le sigue un número, para no confundirla con el insumo sal.)
const abreviaturas = (t: string) =>
  t.replace(/^(\s*)entr?\.?(?=\s)/i, "$1entrando").replace(/^(\s*)sal\.?(?=\s+\d)/i, "$1saliendo");

const RE_MOVIMIENTO_PALABRAS =
  /(entrand|saliend|entr[oó]|sali[oó]|entra|sale|procesad|sin procesar|devolv|devuel|regres|dañ|bot[oóa]|perd|vencid|podrid)/i;

const numerosEnCifras = (t: string) =>
  abreviaturas(t)
    .replace(RE_FRACCION_CIFRAS, (m, a: string, b: string) => (Number(b) > 0 ? redondeo(Number(a) / Number(b)) : m))
    // Fechas y horas escritas en el mensaje no son cantidades: "25/11", "9:30".
    .replace(/(?<![\d.,])\d{1,2}\s*\/\s*\d{1,2}(?:\s*\/\s*\d{2,4})?(?![\d.,])/g, " ")
    .replace(/(?<![\d.,])\d{1,2}:\d{2}(?:\s*(?:a\.?\s*m\.?|p\.?\s*m\.?|am|pm))?/gi, " ")
    .replace(RE_FRACCION_PALABRA, (m, n: string | undefined, f: string) => {
      const veces = n ? Number(NUMEROS[n.toLowerCase()] ?? n) : 1;
      return redondeo(veces * (FRACCIONES[f.toLowerCase()] ?? 0));
    })
    .replace(RE_NUMERO_PALABRA, (m) => NUMEROS[m.toLowerCase()] ?? m)
    .replace(new RegExp(`^.*$`, "s"), (linea) => {
      if (!RE_MOVIMIENTO_PALABRAS.test(linea)) return linea;
      return linea
        .replace(RE_UN_TRAS_CLAVE, (_m, pre: string) => `${pre}1`)
        .replace(RE_DECENA, (_m, d: string, u?: string) => String(DECENAS_N[d.toLowerCase()] + (u ? UNIDADES_N[u.toLowerCase()] : 0)))
        .replace(RE_SUELTO, (m) => String(SUELTOS_N[m.toLowerCase()] ?? m));
    })
    .replace(RE_Y_FRACCION_CON_N, (_m, n: string, u: string, f: string) => `${redondeo(Number(n.replace(",", ".")) + fraccionY(f))} ${u}`)
    .replace(RE_Y_FRACCION_SOLA, (_m, u: string, f: string) => `${redondeo(1 + fraccionY(f))} ${u}`);

type InsumoConPresentacion = { unidadBase: string; unidadCompra?: string | null; cantidadPorCompra?: number | null };

/** Pasa una cantidad del chat ("800 gr", "2 cajas") a la unidad de la
 *  plantilla (0,8 kg; 48 unid). Si es una presentación y el insumo no tiene
 *  la suya cargada, devuelve NaN: no se adivina cuánto trae. */
function enPlantilla(
  c: { n: number; u: string | null } | undefined,
  ins: InsumoConPresentacion | null | undefined,
): number | null {
  if (!c || !Number.isFinite(c.n)) return null;
  if (!ins || !c.u) return c.n;
  const p = unidadPlantilla(ins.unidadBase);
  const gramos = /^(libras?|lbs?)$/i.test(c.u) ? 453.592 : /^(onzas?|oz)$/i.test(c.u) ? 28.3495 : 0;
  if (gramos) {
    const v = convert(c.n * gramos, "g", p.unidad === "unid" ? "unidad" : p.unidad);
    return v == null ? NaN : Math.round(v * 1000) / 1000;
  }
  if (RE_PRESENTACION.test(c.u)) {
    let base: number | null = null;
    if (/^docenas?$/i.test(c.u)) base = c.n * 12 * (getUnit(ins.unidadBase)?.canonica === "unidad" ? 1 : NaN);
    else if ((ins.cantidadPorCompra ?? 0) > 0 && ins.unidadCompra && !getUnit(ins.unidadCompra)) {
      base = c.n * Number(ins.cantidadPorCompra);
    }
    if (base == null || !Number.isFinite(base)) return NaN;
    return Math.round((base / p.factor) * 1000) / 1000;
  }
  const v = convert(c.n, c.u, p.unidad === "unid" ? "unidad" : p.unidad);
  return v == null ? c.n : Math.round(v * 1000) / 1000;
}

const sinTildes = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/**
 * En el chat se escribe corto ("Pollo" por "Pollo entero"): si la primera
 * palabra del nombre de un único insumo aparece en la línea, es ese. Si hay
 * varios candidatos, gana el que comparte más palabras; si empatan, ninguno.
 */
function porPalabraPrincipal<T extends { id: string; nombre: string }>(linea: string, insumos: T[]): T | null {
  const palabras = new Set(sinTildes(linea).split(/[^a-zñ]+/).filter((w) => w.length >= 3));
  let mejor: T | null = null;
  let mejorN = 0;
  let empate = false;
  for (const ins of insumos) {
    const delInsumo = sinTildes(ins.nombre).split(/[^a-zñ]+/).filter((w) => w.length >= 3);
    // Acepta el plural: "pollos" por "pollo", "cebollas" por "cebolla".
    const esta = (w: string) => palabras.has(w) || palabras.has(`${w}s`) || palabras.has(`${w}es`);
    if (delInsumo.length === 0 || !esta(delInsumo[0])) continue;
    const n = delInsumo.filter(esta).length;
    if (n > mejorN) {
      mejor = ins;
      mejorN = n;
      empate = false;
    } else if (n === mejorN) empate = true;
  }
  return empate ? null : mejor;
}

/** Insumos que empatan con el nombre escrito ("queso" → queso blanco y queso
 *  amarillo). Si hay más de uno, no se elige ninguno. */
function empatados<T extends { id: string; nombre: string }>(texto: string, insumos: T[]): T[] {
  const palabras = sinTildes(texto)
    .split(/[^a-zñ]+/)
    .filter((w) => w.length >= 3 && !RELLENO.has(w));
  if (palabras.length === 0) return [];
  const coincide = (w: string, n: string) => w === n || w === `${n}s` || w === `${n}es` || n === `${w}s`;
  let mejor = 0;
  const puntos = insumos.map((ins) => {
    const delInsumo = sinTildes(ins.nombre).split(/[^a-zñ]+/).filter((w) => w.length >= 3 && !RELLENO.has(w));
    const p = palabras.filter((w) => delInsumo.some((n) => coincide(w, n))).length;
    if (p > mejor) mejor = p;
    return { ins, p };
  });
  if (mejor === 0) return [];
  return puntos.filter((x) => x.p === mejor).map((x) => x.ins);
}

const LETRA = "a-záéíóúñü";
// Palabras que dicen si el número es lo que entra (sin procesar) o lo que sale
// (procesado). Se pueden mezclar: "Entrando 8 kg lomito, procesado 6 kg".
const RE_CLAVE = new RegExp(
  `(?<![${LETRA}])(sin\\s+procesar|entrando|entrada|entraron|entran|entra|entr[oó]|bruto|saliendo|salida|salieron|salen|sale|sali[oó]|procesad[oa]s?|qued[oó]|quedaron|quedan|queda|limpi[oa]s?|neto)(?![${LETRA}])`,
  "gi",
);
const RE_SALIDA = /^(sal|proces|qued|limpi|neto)/i;

// Pérdidas ("se dañaron 2 kg de tomate") y devoluciones al almacén.
const RE_PERDIDA = new RegExp(
  `(?<![${LETRA}])(se\\s+dañ\\w*|dañ\\w*|da[ñn]ad[oa]s?|se\\s+bot\\w*|bot(?:é|ó|aron|amos|ad[oa]s?)|se\\s+perdi\\w*|perd(?:í|i)(?:ó|eron|mos)?|perdid[oa]s?|vencid[oa]s?|se\\s+venci\\w*|venci(?:ó|eron)|podrid[oa]s?|se\\s+pudri\\w*|se\\s+cay\\w*|p[ée]rdida)(?![${LETRA}])`,
  "i",
);
const RE_DEVOLUCION = new RegExp(
  `(?<![${LETRA}])(devolv\\w*|devuel\\w*|regres\\w*|vuelve\\s+al\\s+almac\\w*|vuelven\\s+al\\s+almac\\w*|de\\s+vuelta)(?![${LETRA}])`,
  "i",
);
function motivoPerdida(t: string): "perdida" | "mal_estado" | "vencimiento" {
  if (/vencid|venci/i.test(t)) return "vencimiento";
  if (/dañ|da[ñn]ad|podrid|pudri|cay/i.test(t)) return "mal_estado";
  return "perdida";
}
// Medidas de cocina que no se pueden pasar a kg o unidades sin adivinar.
const RE_UNIDAD_RARA = new RegExp(
  `\\d+(?:[.,]\\d+)?\\s*(tazas?|cucharadas?|cucharaditas?|porciones?|raciones?|rebanadas?|lonjas?|rodajas?|tajadas?|pu[ñn]ados?|pizcas?|vasos?|platos?|tiras?)(?![${LETRA}])`,
  "i",
);
// Palabras que no ayudan a reconocer el insumo.
const RELLENO = new Set([
  "de", "del", "la", "el", "los", "las", "para", "al", "en", "con", "por", "hoy", "mañana", "manana",
  "almacen", "almacén", "barra", "cocina", "kilo", "kilos", "unid", "unidades", "que", "una", "uno",
  "se", "sin", "procesar", "todo", "toda", "otro", "otra", "mas", "más",
]);

type Cantidad = { n: number; u: string | null };

/**
 * Número y unidad de un acierto de RE_CANTIDAD. El decimal puede ir con coma o
 * con punto ("8,5" = "8.5"). Excepción: en gramos o mililitros, "1.500" o
 * "1,500" son miles (nadie escribe 1,5 g en una cocina).
 */
function cantidadDe(m: RegExpMatchArray): Cantidad {
  const u = m[2] ? (m[2].toLowerCase() === "k" ? "kg" : m[2].toLowerCase()) : null;
  const pequena = u != null && /^(g|grs?|gramos?|ml)$/.test(u);
  const crudo = pequena && /^\d{1,3}[.,]\d{3}$/.test(m[1]) ? m[1].replace(/[.,]/, "") : m[1].replace(",", ".");
  return { n: Number(crudo), u };
}

function cantidadesDe(texto: string): Cantidad[] {
  return [...texto.matchAll(RE_CANTIDAD)].map(cantidadDe);
}

function nombreDe(texto: string): string {
  return texto
    .replace(RE_CANTIDAD, " ")
    .replace(RE_CLAVE, " ")
    .replace(new RegExp(RE_PERDIDA.source, "gi"), " ")
    .replace(new RegExp(RE_DEVOLUCION.source, "gi"), " ")
    .replace(new RegExp(`[^${LETRA}\\s]`, "gi"), " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Lee un mensaje de texto del grupo de producción. Entiende dos maneras de
 * escribir, y la mezcla entre ellas:
 *   Con palabra clave, seguida del peso y el insumo:
 *     "Entrando 8 kg lomito"      "Saliendo 6 kg lomito"
 *     "Sin procesar 8 kg lomito"  "Procesado 6 kg lomito"
 *     "Entrando 8 kg lomito, procesado 6 kg"
 *   Sin palabra clave: el primer número es la entrada y el segundo la salida.
 *     "Lomito 8 kg quedó 6 kg"    "Cebolla 3 kg 2,5 kg"
 * La entrada y la salida pueden venir en mensajes distintos: cada renglón trae
 * solo lo que el mensaje dice (lo otro queda en null) y se juntan al revisar.
 * Si el número trae unidad (800 g) se pasa a la unidad de la plantilla (0,8 kg).
 * Las líneas con números pero sin insumo reconocible quedan con el insumo en
 * blanco para elegirlo al revisar.
 */
export function leerMensaje<T extends { id: string; nombre: string } & InsumoConPresentacion>(
  texto: string,
  insumos: T[],
): RenglonLeido[] {
  const out: RenglonLeido[] = [];
  /** Insumo del nombre escrito; si varios empatan, ninguno (y la lista). */
  const resolver = (nombre: string): { ins: T | null; ambiguos: string[] } => {
    if (!/[a-záéíóúñ]{3,}/i.test(nombre)) return { ins: null, ambiguos: [] };
    const emp = empatados(nombre, insumos);
    if (emp.length > 1) return { ins: null, ambiguos: emp.map((i) => i.nombre) };
    return {
      ins: sugerirInsumo(nombre, insumos) ?? porPalabraPrincipal(nombre, insumos) ?? emp[0] ?? null,
      ambiguos: [],
    };
  };
  const RE_CUALQUIER_CLAVE = new RegExp(`${RE_CLAVE.source}|${RE_PERDIDA.source}|${RE_DEVOLUCION.source}`, "i");
  const SEPARADOR = new RegExp(`(?<!\\d),|,(?!\\d)|(?<![${LETRA}])(?:y|e)(?![${LETRA}])`, "i");
  /** "Entrando 2 kg lomito, 3 kg cebolla": si una línea nombra varios
   *  insumos, cada uno va por separado y hereda la palabra clave anterior. */
  const expandir = (linea: string): string[] => {
    const frases = linea.split(SEPARADOR).map((f) => f.trim()).filter(Boolean);
    if (frases.length < 2) return [linea];
    const distintos = new Set<string>();
    for (const f of frases) {
      const { ins, ambiguos } = resolver(nombreDe(f));
      if (ins) distintos.add(ins.id);
      else if (ambiguos.length) distintos.add(`?${f}`);
    }
    if (distintos.size < 2) return [linea];
    let clave = "";
    return frases.map((f) => {
      const k = f.match(RE_CUALQUIER_CLAVE);
      if (k) {
        clave = k[0];
        return f;
      }
      return clave ? `${clave} ${f}` : f;
    });
  };
  const insumoDe = (id: string) => insumos.find((i) => i.id === id);
  /** Agrega o completa el renglón de un insumo. */
  const anotar = (
    insumoId: string,
    tomada: number | null,
    util: number | null,
    leido?: string,
    entradaExplicita = false,
  ) => {
    const r = insumoId ? out.find((x) => x.insumoId === insumoId) : undefined;
    if (r) {
      if (r.tomada == null) r.tomada = tomada;
      if (r.util == null) r.util = util;
      r.entradaExplicita = r.entradaExplicita || entradaExplicita;
    } else out.push({ insumoId, tomada, util, leido, entradaExplicita });
  };

  for (const lineaOriginal of texto.split(/\n|;/)) for (const linea of expandir(numerosEnCifras(lineaOriginal))) {
    // "2 tazas de arroz": no se convierte a kg sin adivinar.
    const rara = linea.match(RE_UNIDAD_RARA);
    if (rara) {
      const nombre = nombreDe(linea.replace(RE_UNIDAD_RARA, " "));
      const { ins, ambiguos } = resolver(nombre);
      out.push({ insumoId: ins?.id ?? "", tomada: null, util: null, leido: nombre, unidadRara: rara[0].trim(), ambiguos: ambiguos.length ? ambiguos : undefined });
      continue;
    }
    // Pérdidas y devoluciones: la cantidad va en `util`.
    const especial = RE_PERDIDA.test(linea) ? "perdida" : RE_DEVOLUCION.test(linea) ? "devolucion" : null;
    if (especial) {
      const cantidades = cantidadesDe(linea);
      if (cantidades.length === 0) continue;
      const nombre = nombreDe(linea);
      const { ins, ambiguos } = resolver(nombre);
      out.push({
        insumoId: ins?.id ?? "",
        tomada: null,
        util: enPlantilla(cantidades[0], ins),
        leido: nombre,
        especial,
        motivo: especial === "perdida" ? motivoPerdida(linea) : undefined,
        ambiguos: ambiguos.length ? ambiguos : undefined,
      });
      continue;
    }
    const claves = [...linea.matchAll(RE_CLAVE)];
    const previo = out[out.length - 1];

    if (claves.length === 0) {
      const cantidades = cantidadesDe(linea);
      if (cantidades.length === 0) continue;
      const nombre = nombreDe(linea);
      if (!/[a-záéíóúñ]{3,}/i.test(nombre) && !(previo && cantidades.length === 1)) continue;
      const { ins, ambiguos } = resolver(nombre);
      if (ambiguos.length) {
        out.push({ insumoId: "", tomada: cantidades[0]?.n ?? null, util: cantidades[1]?.n ?? null, leido: nombre, ambiguos });
        continue;
      }
      // "Lomito 8 kg" y en la línea siguiente "6 kg": completa el renglón anterior.
      if (!ins && previo && previo.util == null && cantidades.length === 1) {
        previo.util = enPlantilla(cantidades[0], insumoDe(previo.insumoId));
        continue;
      }
      // Sin insumo reconocido, un número suelto suele ser conversación ("somos 5").
      if (!ins && cantidades.length < 2) continue;
      anotar(ins?.id ?? "", enPlantilla(cantidades[0], ins), enPlantilla(cantidades[1], ins), nombre);
      continue;
    }

    // Con palabras clave. La línea se parte en frases (por coma o "y"); en cada
    // frase la palabra clave va con su peso, esté antes o después:
    // "Entrando 8 kg lomito", "Lomito 8 kg entrando", "Lomito entrando 8 kg".
    const { ins, ambiguos } = resolver(nombreDe(linea));
    if (ambiguos.length) {
      out.push({ insumoId: "", tomada: null, util: null, leido: nombreDe(linea), ambiguos });
      continue;
    }
    // Sin nombre en la línea ("procesado 6 kg"): es del insumo anterior.
    const destino = ins ?? (previo?.insumoId ? insumoDe(previo.insumoId) ?? null : null);
    let tomada: number | null = null;
    let util: number | null = null;
    let entradaPorClave = false;
    const sinClave: Cantidad[] = [];
    for (const frase of linea.split(new RegExp(`(?<!\\d),|,(?!\\d)|(?<![${LETRA}])(?:y|e)(?![${LETRA}])`, "i"))) {
      const ks = [...frase.matchAll(RE_CLAVE)].map((m) => ({ i: m.index!, fin: m.index! + m[1].length, salida: RE_SALIDA.test(m[1]) }));
      const ns = [...frase.matchAll(RE_CANTIDAD)].map((m) => ({
        i: m.index!,
        c: cantidadDe(m),
        usado: false,
      }));
      // Cada palabra toma el primer peso que la sigue (antes de la próxima
      // palabra); si no hay, el último peso libre que la precede.
      ks.forEach((k, j) => {
        const limite = j + 1 < ks.length ? ks[j + 1].i : Infinity;
        const n =
          ns.find((x) => !x.usado && x.i >= k.fin && x.i < limite) ??
          [...ns].reverse().find((x) => !x.usado && x.i < k.i);
        if (!n) return;
        n.usado = true;
        if (k.salida) util ??= enPlantilla(n.c, destino);
        else if (tomada == null) {
          tomada = enPlantilla(n.c, destino);
          entradaPorClave = true;
        }
      });
      for (const n of ns) if (!n.usado) sinClave.push(n.c);
    }
    // "Lomito 8 kg, quedó 6": el número sin palabra ocupa el lugar que falta.
    for (const c of sinClave) {
      if (tomada == null) tomada = enPlantilla(c, destino);
      else if (util == null) util = enPlantilla(c, destino);
    }
    if (tomada == null && util == null) continue;
    anotar(destino?.id ?? "", tomada, util, nombreDe(linea), entradaPorClave);
  }
  return out;
}
