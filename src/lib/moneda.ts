/** Dólares de Bolo y su equivalente en bolívares a una tasa Bs por USD (BCV). */

export function fmtUsd(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  const s = Math.abs(v).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return v < 0 ? `−$${s}` : `$${s}`;
}

export function fmtBs(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  const s = Math.abs(v).toLocaleString("es-VE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return v < 0 ? `−Bs ${s}` : `Bs ${s}`;
}

/** "$1,234.00 · Bs 45.678,90". Sin tasa, solo el dólar. */
export function fmtUsdBs(usd: number, tasaUsdBs: number | null | undefined): string {
  const base = fmtUsd(usd);
  if (tasaUsdBs == null || !(tasaUsdBs > 0)) return base;
  return `${base} · ${fmtBs(usd * tasaUsdBs)}`;
}
