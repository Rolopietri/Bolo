// Presentación de compra de un insumo: cómo viene (saco, caja, botella…) y
// cuánto trae (45 kg, 12 unidades, 1 L). Con eso se arman los tres campos que
// guarda el insumo — unidad de compra, cantidad por compra y unidad base — sin
// que la persona tenga que hacer la conversión a mano.

import { canonica, convert, dimension, getUnit } from "@/lib/units";

/** "Suelto": se compra directo por kg, L o unidad (sin empaque). */
export const SUELTO = "Suelto";

/** Tipos de presentación más comunes en cocina. "Otra…" permite escribir una. */
export const TIPOS_PRESENTACION = [
  "Saco",
  "Bulto",
  "Caja",
  "Paquete",
  "Bolsa",
  "Botella",
  "Garrafa",
  "Galón",
  "Bidón",
  "Lata",
  "Frasco",
  "Pote",
  "Tarro",
  "Bandeja",
  "Cartón",
  "Docena",
  "Rollo",
  "Barra",
  "Ramillete",
];

/** Unidades en que se expresa lo que trae la presentación. */
export const UNIDADES_CONTENIDO = ["kg", "g", "L", "ml", "unidad"];

/** Contenido sugerido al elegir un tipo (solo si aún no escribió nada). */
export const CONTENIDO_SUGERIDO: Record<string, { cantidad: string; unidad: string }> = {
  Docena: { cantidad: "12", unidad: "unidad" },
  Cartón: { cantidad: "30", unidad: "unidad" },
};

export type Presentacion = {
  /** SUELTO, un tipo de la lista o uno escrito a mano. */
  tipo: string;
  /** Cuánto trae (texto del input). Ignorado si es SUELTO. */
  cantidad: string;
  /** Unidad del contenido (kg, g, L, ml, unidad o una escrita a mano). */
  unidad: string;
};

export type CamposInsumo = {
  unidadCompra: string;
  cantidadPorCompra: string;
  unidadBase: string;
};

function fmt(n: number): string {
  return Number(n.toFixed(3)).toString();
}

/** Unidad base para guardar: la más chica de la dimensión (g, ml, unidad),
 *  salvo que el insumo ya tenga una base compatible (se respeta al editar para
 *  no descuadrar su stock). */
function baseParaUnidad(unidad: string, baseActual?: string): string {
  const dim = dimension(unidad);
  if (dim === "desconocida") return unidad.trim();
  if (baseActual && dimension(baseActual) === dim) return baseActual;
  if (dim === "peso") return "g";
  if (dim === "volumen") return "ml";
  return "unidad";
}

/** Convierte la presentación elegida a los campos del insumo. Devuelve null
 *  mientras falten datos (tipo, cantidad > 0 o unidad). */
export function armarPresentacion(
  p: Presentacion,
  baseActual?: string,
): CamposInsumo | null {
  const tipo = p.tipo.trim();
  const unidad = p.unidad.trim();
  if (!tipo || !unidad) return null;
  const base = baseParaUnidad(unidad, baseActual);
  if (tipo === SUELTO) {
    const f = convert(1, unidad, base) ?? 1;
    return {
      unidadCompra: canonica(unidad),
      cantidadPorCompra: fmt(f),
      unidadBase: base,
    };
  }
  const n = Number(p.cantidad.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  const enBase = convert(n, unidad, base) ?? n;
  const u = canonica(unidad);
  return {
    unidadCompra: `${tipo} ${fmt(n)} ${u === "unidad" && n !== 1 ? "unid" : u}`,
    cantidadPorCompra: fmt(enBase),
    unidadBase: base,
  };
}

/** Expresa `cantidad` (en `unidadBase`) en la unidad más legible (45000 g →
 *  45 kg). */
function contenidoLegible(cantidad: number, unidadBase: string): { cantidad: string; unidad: string } {
  const c = getUnit(unidadBase)?.canonica;
  if (c === "g" && cantidad >= 1000) return { cantidad: fmt(cantidad / 1000), unidad: "kg" };
  if (c === "ml" && cantidad >= 1000) return { cantidad: fmt(cantidad / 1000), unidad: "L" };
  return { cantidad: fmt(cantidad), unidad: c ?? unidadBase };
}

/** Lee los campos guardados de un insumo y los devuelve como presentación,
 *  para editarla. Entiende "Saco 45 kg", "paq 24 unid", "kg" (suelto) y, si no
 *  reconoce el texto, lo deja como tipo escrito a mano con su contenido. */
export function leerPresentacion(c: {
  unidadCompra: string;
  cantidadPorCompra: number;
  unidadBase: string;
}): Presentacion {
  const compra = (c.unidadCompra ?? "").trim();
  if (!compra) return { tipo: "", cantidad: "", unidad: "" };
  const cpc = c.cantidadPorCompra > 0 ? c.cantidadPorCompra : 1;

  // Suelto: la unidad de compra es una unidad estándar (kg, L, unidad…).
  if (getUnit(compra)) {
    return { tipo: SUELTO, cantidad: "1", unidad: canonica(compra) };
  }

  // "Saco 45 kg", "paq 24 unid", "500g": tipo + número + unidad conocida.
  const m = compra.match(/^(.*?)\s*(\d+(?:[.,]\d+)?)\s*([a-zA-ZáéíóúÁÉÍÓÚ]+)\.?$/);
  // "unid" es como se abrevia en las etiquetas ("paq 24 unid").
  const unidadTxt = m && /^unid$/i.test(m[3]) ? "unidad" : m?.[3];
  if (m && unidadTxt && getUnit(unidadTxt)) {
    const n = Number(m[2].replace(",", "."));
    const enBase = convert(n, unidadTxt, c.unidadBase);
    // Solo si cuadra con lo guardado (si no, manda el dato guardado).
    if (enBase != null && Math.abs(enBase - cpc) <= cpc * 0.01) {
      const tipoTxt = m[1].trim();
      const tipo =
        TIPOS_PRESENTACION.find((t) => t.toLowerCase() === tipoTxt.toLowerCase()) ??
        (tipoTxt || "Paquete");
      return { tipo, cantidad: fmt(n), unidad: canonica(unidadTxt) };
    }
  }

  const leg = contenidoLegible(cpc, c.unidadBase);
  return { tipo: compra, cantidad: leg.cantidad, unidad: leg.unidad };
}
