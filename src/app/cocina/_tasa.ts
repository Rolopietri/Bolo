/** Lectura de un monto escrito a mano. El separador de más a la derecha es el
 *  decimal, así valen "10", "10.5", "10,50" y "1.234,56". */
export function parseMonto(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const iComa = t.lastIndexOf(",");
  const iPunto = t.lastIndexOf(".");
  let limpio: string;
  if (iComa >= 0 && iPunto >= 0) {
    const dec = Math.max(iComa, iPunto);
    limpio = t.slice(0, dec).replace(/[.,]/g, "") + "." + t.slice(dec + 1).replace(/[.,]/g, "");
  } else {
    limpio = t.replace(",", ".");
  }
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

export function formatoMonto(n: number): string {
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("es-VE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** La tasa oficial trae más de dos decimales. Se muestra así para que
 *  coincida con la cuenta de la calculadora. */
export function formatoTasa(n: number): string {
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("es-VE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

export function bsDesdeUsd(usd: number, tasaUsdBs: number): number {
  return usd * tasaUsdBs;
}

export function usdDesdeBs(bs: number, tasaUsdBs: number): number {
  return tasaUsdBs > 0 ? bs / tasaUsdBs : Number.NaN;
}

/** YYYY-MM-DD en Caracas, para saber si la tasa guardada es la de hoy. */
export function fechaHoyCaracas(ahora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Caracas",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora);
}

/** Qué tasa usa la calculadora. USDT existe en la lista, pero esta fuente no lo trae. */
export type IdTasa = "bcv" | "euro" | "promedio" | "usdt" | "personalizada";

export type Cotizacion = {
  fecha: string;
  /** Dólar oficial BCV. */
  bcv: number | null;
  /** Euro oficial BCV. */
  euro: number | null;
  /** Promedio del paralelo (ve.dolarapi / paralela_bs). No es USDT. */
  promedio: number | null;
};

export function cotizacionDe(t: {
  fecha: string;
  usdBs: number;
  eurBs?: number;
  paralelaBs?: number;
} | null): Cotizacion | null {
  if (!t || !(t.usdBs > 0)) return null;
  return {
    fecha: t.fecha,
    bcv: t.usdBs,
    euro: t.eurBs != null && t.eurBs > 0 ? t.eurBs : null,
    promedio: t.paralelaBs != null && t.paralelaBs > 0 ? t.paralelaBs : null,
  };
}

export function tasaPersonalizada(texto: string): number | null {
  const n = parseMonto(texto);
  return n != null && n > 0 ? n : null;
}

/** (otra − BCV) / BCV. Sin USDT no hay brecha que mostrar. */
export function brechaSobreBcv(bcv: number | null, otra: number | null): number | null {
  if (bcv == null || otra == null || bcv <= 0) return null;
  return ((otra - bcv) / bcv) * 100;
}

export function valorDeTasa(id: IdTasa, cot: Cotizacion | null, personalizada: number | null): number | null {
  if (id === "personalizada") return personalizada;
  if (id === "usdt" || !cot) return null;
  if (id === "bcv") return cot.bcv;
  if (id === "euro") return cot.euro;
  return cot.promedio;
}

/** Si la preferida no tiene número, cae a la primera que sí.
 *  Personalizada se queda elegida aunque el campo aún esté vacío. */
export function seleccionUsable(preferida: IdTasa, cot: Cotizacion | null, personalizada: number | null): IdTasa {
  if (preferida === "personalizada") return "personalizada";
  if (valorDeTasa(preferida, cot, personalizada)) return preferida;
  if (cot?.bcv) return "bcv";
  if (cot?.promedio) return "promedio";
  if (cot?.euro) return "euro";
  if (personalizada) return "personalizada";
  return "bcv";
}

export function fechaTasaLegible(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Intl.DateTimeFormat("es-VE", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}
