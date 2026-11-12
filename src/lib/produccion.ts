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
const RE_CANTIDAD =
  /(\d+(?:[.,]\d+)?)\s*(kilogramos?|kilos?|kgs?|k|gramos?|grs?|g|litros?|lts?|l|ml|unidades|unid|und|uds?|u)?(?![a-záéíóúñ])/gi;

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
    if (delInsumo.length === 0 || !palabras.has(delInsumo[0])) continue;
    const n = delInsumo.filter((w) => palabras.has(w)).length;
    if (n > mejorN) {
      mejor = ins;
      mejorN = n;
      empate = false;
    } else if (n === mejorN) empate = true;
  }
  return empate ? null : mejor;
}

/**
 * Lee un mensaje de texto del grupo de producción. Cada línea con un nombre de
 * insumo y números es un renglón: el primer número es lo que entró sin
 * procesar y el segundo lo que quedó procesado. Ejemplos que entiende:
 *   "Carne molida 10 kg → 6,2 kg"
 *   "Cebolla: 3 / 2,5"
 *   "Pollo 12 und quedaron 12"
 * Si el número trae unidad (800 g) se pasa a la unidad de la plantilla (0,8 kg).
 * Las líneas con números pero sin insumo reconocible quedan con el insumo en
 * blanco para elegirlo al revisar.
 */
export function leerMensaje<T extends { id: string; nombre: string; unidadBase: string }>(
  texto: string,
  insumos: T[],
): RenglonLeido[] {
  const out: RenglonLeido[] = [];
  const vistos = new Set<string>();
  for (const linea of texto.split(/\n|;/)) {
    const cantidades = [...linea.matchAll(RE_CANTIDAD)].map((m) => ({
      n: Number(m[1].replace(",", ".")),
      u: m[2] ? (m[2].toLowerCase() === "k" ? "kg" : m[2].toLowerCase()) : null,
    }));
    if (cantidades.length === 0) continue;
    const nombre = linea.replace(RE_CANTIDAD, " ").replace(/[^a-záéíóúñü\s]/gi, " ").trim();
    if (!/[a-záéíóúñ]{3,}/i.test(nombre)) continue;
    const ins = sugerirInsumo(nombre, insumos) ?? porPalabraPrincipal(nombre, insumos);
    // Sin insumo reconocido, un número suelto suele ser conversación ("somos 5").
    if (!ins && cantidades.length < 2) continue;
    if (ins && vistos.has(ins.id)) continue;
    if (ins) vistos.add(ins.id);
    const enPlantilla = (c: { n: number; u: string | null } | undefined): number | null => {
      if (!c || !Number.isFinite(c.n)) return null;
      if (!ins || !c.u) return c.n;
      const p = unidadPlantilla(ins.unidadBase);
      const destino = p.unidad === "unid" ? "unidad" : p.unidad;
      const v = convert(c.n, c.u, destino);
      return v == null ? c.n : Math.round(v * 1000) / 1000;
    };
    out.push({ insumoId: ins?.id ?? "", tomada: enPlantilla(cantidades[0]), util: enPlantilla(cantidades[1]) });
  }
  return out;
}
