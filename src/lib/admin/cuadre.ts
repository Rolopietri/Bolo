// Cómo se pasa un movimiento a dólares para que Semana, Estado de cuenta,
// Análisis e Históricos usen la misma regla.
//
// Ventas: el total guardado, o precio × cantidad si faltó (montoVenta).
// Egresos: el equivalente ya guardado (monto_usd). Si no está, USD tal cual,
// bolívares ÷ tasa BCV del día, euros × cruce BCV (eur_bs ÷ usd_bs).
// Compras de Cocina: precio de los insumos más el flete. No se vuelven a
// contar si alguien además las anotó como egreso categoría Insumos.

import { montoVenta } from "@/lib/semana";

export type TasaDia = {
  fecha: string;
  usdBs: number;
  eurBs?: number | null;
};

export type EgresoComoUsd = {
  fecha?: string | null;
  monto?: number | null;
  moneda?: string | null;
  monto_usd?: number | null;
};

function n(v: unknown): number {
  if (v == null || v === "") return 0;
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
}

function dia(fecha: string | null | undefined): string {
  return (fecha ?? "").slice(0, 10);
}

function sinAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export function tablasTasa(tasas: TasaDia[]) {
  const usd = new Map<string, number>();
  const cross = new Map<string, number>();
  let ultimoUsd = 0;
  let ultimoCross = 0;
  const orden = [...tasas].sort((a, b) => dia(a.fecha).localeCompare(dia(b.fecha)));
  for (const t of orden) {
    const u = n(t.usdBs);
    const e = t.eurBs == null ? 0 : n(t.eurBs);
    if (u > 0) {
      usd.set(dia(t.fecha), u);
      ultimoUsd = u;
    }
    if (e > 0 && u > 0) {
      const c = e / u;
      cross.set(dia(t.fecha), c);
      ultimoCross = c;
    }
  }
  return {
    usdBs(fecha: string | null | undefined): number {
      return usd.get(dia(fecha)) || ultimoUsd;
    },
    crossEur(fecha: string | null | undefined): number {
      return cross.get(dia(fecha)) || ultimoCross;
    },
    ultimaUsdBs: ultimoUsd,
  };
}

/** Dólares de un egreso de Administración. */
export function usdDeEgreso(e: EgresoComoUsd, tasas: TasaDia[]): number {
  if (e.monto_usd != null && Number.isFinite(Number(e.monto_usd))) {
    return n(e.monto_usd);
  }
  const mon = (e.moneda || "USD").trim();
  const monto = n(e.monto);
  const t = tablasTasa(tasas);
  if (mon === "USD") return monto;
  if (mon === "Bs") {
    const tasa = t.usdBs(e.fecha);
    return tasa > 0 ? monto / tasa : 0;
  }
  if (mon === "EUR") {
    const c = t.crossEur(e.fecha);
    return c > 0 ? monto * c : 0;
  }
  return 0;
}

/** Dólares de una compra de Cocina: insumos + flete. */
export function usdDeCompra(c: { precioTotalUsd?: number | null; fleteUsd?: number | null }): number {
  return n(c.precioTotalUsd) + n(c.fleteUsd);
}

/** La categoría Insumos se cuenta con las compras de Cocina, no otra vez. */
export function esCategoriaInsumos(nombre: string | null | undefined): boolean {
  const k = sinAcento(nombre ?? "");
  return k === "insumos" || k === "insumos (cocina)";
}

/** Cortesía: no es plata que salió. Se muestra aparte, no en el balance. */
export function esCategoriaCortesia(nombre: string | null | undefined): boolean {
  return sinAcento(nombre ?? "").includes("cortesia");
}

/** Suma de ventas ya en dólares. Misma regla que el cierre de caja. */
export function sumarVentasUsd(
  ventas: { totalUsd?: number | null; precioUnitarioUsd?: number | null; cantidad: number }[],
): number {
  return ventas.reduce((s, v) => s + montoVenta(v), 0);
}
