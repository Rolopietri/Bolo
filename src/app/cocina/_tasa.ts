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

export function fechaTasaLegible(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Intl.DateTimeFormat("es-VE", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}
