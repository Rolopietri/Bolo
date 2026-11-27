/** Dólares de Bolo y su equivalente en bolívares a una tasa Bs por USD (BCV). */

import { fmtDec } from "@/lib/decimal";

export function fmtUsd(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  const s = fmtDec(Math.abs(v), "en-US");
  return v < 0 ? `−$${s}` : `$${s}`;
}

export function fmtBs(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  const s = fmtDec(Math.abs(v), "es-VE");
  return v < 0 ? `−Bs ${s}` : `Bs ${s}`;
}

/** "$1,234.00 · Bs 45.678,90". Sin tasa, solo el dólar. */
export function fmtUsdBs(usd: number, tasaUsdBs: number | null | undefined): string {
  const base = fmtUsd(usd);
  if (tasaUsdBs == null || !(tasaUsdBs > 0)) return base;
  return `${base} · ${fmtBs(usd * tasaUsdBs)}`;
}
