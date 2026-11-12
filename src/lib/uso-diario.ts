// Uso diario de insumos: cuánto salió de cada insumo cada día y por qué.
//
// Se arma con lo que ya está guardado, sin conteo físico:
//   • ventas del día → receta (con subrecetas) → insumos. Si un día se
//     vendieron 10 hamburguesas, salen 10 panes ese día (con la fecha de la
//     venta, aunque se haya importado después);
//   • mermas de receta (ventas marcadas es_merma);
//   • pérdidas anotadas a mano (stock_movimientos);
//   • compras (entradas).
// Con eso se compara un día contra otro y contra el promedio del período.

import { restarDiasISO, salidasDeVenta, type ExpandirReceta, type VentaParaStock } from "@/lib/stock-liviano";

export type VentaUso = VentaParaStock & {
  /** Producto vendido (nombre de la receta o del artículo). */
  producto: string;
  /** Merma de producción: descuenta stock pero no es venta. */
  esMerma: boolean;
};

export type EntradaUso = { insumoId: string; fecha: string; cantidad: number };

/** Uso de un insumo en un día. Todas las cantidades en unidad base. */
export type UsoDia = {
  fecha: string;
  /** Salió por ventas. */
  vendido: number;
  /** Producto → cantidad del insumo que consumió (para "10 panes ← 10 hamburguesas"). */
  porProducto: Map<string, { cantidad: number; unidades: number }>;
  /** Salió por mermas de receta. */
  mermaReceta: number;
  /** Salió por pérdidas anotadas a mano. */
  perdidas: number;
  /** Entró por compras. */
  comprado: number;
};

export type HistorialInsumo = {
  insumoId: string;
  /** Un día por fecha del período (también los días sin movimiento), del más viejo al más nuevo. */
  dias: UsoDia[];
  /** Total que salió en el período (ventas + mermas + pérdidas). */
  usadoTotal: number;
  /** Promedio diario de lo que salió, contando solo los días con movimiento de ventas. */
  promedioDiario: number;
  /** Días con algo vendido. */
  diasConUso: number;
};

export function usoTotalDia(d: UsoDia): number {
  return d.vendido + d.mermaReceta + d.perdidas;
}

/** Fechas YYYY-MM-DD del período [desde, hasta], de la más vieja a la más nueva. */
export function fechasDelPeriodo(desde: string, hasta: string): string[] {
  const out: string[] = [];
  let f = hasta;
  // Tope de seguridad: un año.
  for (let i = 0; i < 366 && f >= desde; i++) {
    out.push(f);
    f = restarDiasISO(f, 1);
  }
  return out.reverse();
}

function diaVacio(fecha: string): UsoDia {
  return { fecha, vendido: 0, porProducto: new Map(), mermaReceta: 0, perdidas: 0, comprado: 0 };
}

/**
 * Historial por insumo en el período. `expandir` abre una receta en sus
 * insumos (la misma función que usa la vista de Stock), así que lo que se
 * resta aquí es lo mismo que resta la base al registrar la venta.
 */
export function armarHistorial(input: {
  desde: string;
  hasta: string;
  ventas: VentaUso[];
  perdidas: EntradaUso[];
  compras: EntradaUso[];
  expandir: ExpandirReceta;
}): Map<string, HistorialInsumo> {
  const fechas = fechasDelPeriodo(input.desde, input.hasta);
  const porInsumo = new Map<string, Map<string, UsoDia>>();
  const dia = (insumoId: string, fecha: string): UsoDia | null => {
    if (fecha < input.desde || fecha > input.hasta) return null;
    let m = porInsumo.get(insumoId);
    if (!m) {
      m = new Map(fechas.map((f) => [f, diaVacio(f)]));
      porInsumo.set(insumoId, m);
    }
    return m.get(fecha) ?? null;
  };

  for (const v of input.ventas) {
    for (const s of salidasDeVenta(v, input.expandir)) {
      const d = dia(s.insumoId, s.fecha);
      if (!d) continue;
      if (v.esMerma) {
        d.mermaReceta += s.cantidad;
        continue;
      }
      d.vendido += s.cantidad;
      const p = d.porProducto.get(v.producto) ?? { cantidad: 0, unidades: 0 };
      p.cantidad += s.cantidad;
      p.unidades += v.cantidad;
      d.porProducto.set(v.producto, p);
    }
  }
  for (const p of input.perdidas) {
    const d = dia(p.insumoId, p.fecha);
    if (d) d.perdidas += Math.abs(p.cantidad);
  }
  for (const c of input.compras) {
    const d = dia(c.insumoId, c.fecha);
    if (d) d.comprado += c.cantidad;
  }

  const out = new Map<string, HistorialInsumo>();
  for (const [insumoId, m] of porInsumo) {
    const dias = fechas.map((f) => m.get(f)!);
    const usadoTotal = dias.reduce((s, d) => s + usoTotalDia(d), 0);
    const conUso = dias.filter((d) => usoTotalDia(d) > 1e-9);
    out.set(insumoId, {
      insumoId,
      dias,
      usadoTotal,
      diasConUso: conUso.length,
      promedioDiario: conUso.length > 0 ? usadoTotal / conUso.length : 0,
    });
  }
  return out;
}

/**
 * Stock estimado al cierre de cada día, contando hacia atrás desde el stock
 * actual: cierre(d) = cierre(d+1) − compras(d+1) + salidas(d+1). Es una
 * estimación: no ve ajustes manuales de la ficha.
 */
export function stockAlCierre(stockActual: number, dias: UsoDia[], hoy: string): Map<string, number> {
  const out = new Map<string, number>();
  let s = stockActual;
  // Lo de días posteriores al período (no debería haber si hasta = hoy).
  for (let i = dias.length - 1; i >= 0; i--) {
    const d = dias[i];
    if (d.fecha > hoy) continue;
    out.set(d.fecha, Math.max(0, s));
    s = s - d.comprado + usoTotalDia(d);
  }
  return out;
}

/** Cómo se compara el uso de un día con el promedio del período. */
export type ComparacionDia = "normal" | "alto" | "bajo" | "sin_uso";

export function compararConPromedio(usado: number, promedio: number): { tipo: ComparacionDia; variacion: number | null } {
  if (!(usado > 1e-9)) return { tipo: "sin_uso", variacion: null };
  if (!(promedio > 1e-9)) return { tipo: "normal", variacion: null };
  const variacion = usado / promedio - 1;
  if (variacion >= 0.5) return { tipo: "alto", variacion };
  if (variacion <= -0.5) return { tipo: "bajo", variacion };
  return { tipo: "normal", variacion };
}
