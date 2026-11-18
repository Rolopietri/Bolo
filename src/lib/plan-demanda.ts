// Plan por demanda (Fase C): qué procesar y qué comprar según el ritmo de venta.
//
// Para cada insumo que SE PROCESA:
//   ritmo          = venta promedio por día (consumo neto ÷ ventana)
//   necesidad      = ritmo × horizonte (lo procesado que hace falta para el período)
//   falta procesar = necesidad − procesado disponible
//   crudo necesario= falta ÷ (1 − merma)      (para obtener ese procesado)
//   a comprar      = crudo necesario − crudo disponible
//
// Módulo puro (sin base ni navegador): reutiliza el ritmo que ya calcula
// stock-liviano, no reinventa el historial de ventas.

// Módulo puro, sin imports (como stock-liviano/reposicion), para poder probarlo
// con Node. Las constantes de ventana/umbral y la forma de ConsumoInsumo
// reflejan las de stock-liviano; si cambian allá, cámbialas aquí.
import type { Insumo } from "./types";

/** Igual a VENTANA_CONSUMO_DIAS de stock-liviano. */
export const VENTANA_RITMO_DIAS = 14;
/** Igual a MIN_DIAS_CON_CONSUMO de stock-liviano. */
const MIN_DIAS_CON_CONSUMO = 2;

/** Consumo neto de un insumo en la ventana (misma forma que en stock-liviano). */
export type ConsumoInsumo = { total: number; diasConConsumo: number };

/** Horizonte por defecto si el insumo no define uno propio. */
export const HORIZONTE_DEFAULT_DIAS = 14;

export type LineaPlanDemanda = {
  insumoId: string;
  nombre: string;
  unidadBase: string;
  /** Ritmo de venta estimado, en unidad base por día. 0 si no hay datos. */
  ritmoDiario: number;
  /** true si no hubo suficientes ventas en la ventana para estimar el ritmo. */
  sinDatos: boolean;
  horizonteDias: number;
  /** Necesidad de procesado para el horizonte = ritmo × horizonte. */
  necesidad: number;
  /** Stock procesado disponible hoy. */
  procesado: number;
  /** Stock crudo disponible hoy (stockTotal). */
  crudo: number;
  /** Merma por procesamiento usada (0–99). */
  mermaPorc: number;
  /** Procesado que falta producir para cubrir la necesidad. */
  faltaProcesar: number;
  /** Crudo necesario para producir ese faltante (ya aplicada la merma). */
  crudoNecesario: number;
  /** Crudo a comprar = crudo necesario − crudo disponible (nunca negativo),
   *  en unidad base, SIN redondear. */
  aComprar: number;
  /** Nombre de la unidad de compra (empaque): "kg", "saco", "caja"… */
  unidadCompra: string;
  /** Cuántas unidades base trae un empaque. */
  cantidadPorCompra: number;
  /** Empaques a pedir, redondeado HACIA ARRIBA (la compra realista al proveedor). */
  empaquesComprar: number;
  /** A comprar ya redondeado al empaque, en unidad base (empaques × cantidadPorCompra). */
  aComprarEmpaque: number;
  /** true si la compra se subió al mínimo (1 unidad de compra) porque la
   *  necesidad real era menor. */
  aplicoMinimo: boolean;
  /** Costo de la compra realista (empaques × precio de compra). 0 si no hay precio. */
  costoCompra: number;
  /** true si el insumo tiene precio de compra para estimar el costo. */
  tienePrecio: boolean;
};

/** Ritmo de venta (unidad base/día) a partir del consumo neto de la ventana.
 *  Devuelve 0 si no hay datos suficientes (misma regla que "alcanza para"). */
export function ritmoDiario(
  c: ConsumoInsumo | undefined,
  ventana: number = VENTANA_RITMO_DIAS,
): number {
  if (
    !c ||
    !(c.total > 0) ||
    c.diasConConsumo < MIN_DIAS_CON_CONSUMO ||
    !(ventana > 0)
  ) {
    return 0;
  }
  return c.total / ventana;
}

/** Plan por demanda de UN insumo. */
export function planDemandaInsumo(
  i: Insumo,
  c: ConsumoInsumo | undefined,
  ventana: number = VENTANA_RITMO_DIAS,
): LineaPlanDemanda {
  const ritmo = ritmoDiario(c, ventana);
  const horizonteDias =
    i.horizonteDias && i.horizonteDias > 0 ? i.horizonteDias : HORIZONTE_DEFAULT_DIAS;
  const procesado = i.stockProcesado ?? 0;
  const crudo = i.stockTotal ?? 0;
  const mermaPorc = Math.min(99, Math.max(0, i.mermaCoccionPorc ?? 0));
  const necesidad = ritmo * horizonteDias;
  const faltaProcesar = Math.max(0, necesidad - procesado);
  const factor = 1 - mermaPorc / 100; // > 0 porque mermaPorc ≤ 99
  const crudoNecesario = factor > 0 ? faltaProcesar / factor : faltaProcesar;
  const aComprar = Math.max(0, crudoNecesario - crudo);
  // Redondeo a la realidad del proveedor: se compra por empaques enteros.
  const cantidadPorCompra = i.cantidadPorCompra > 0 ? i.cantidadPorCompra : 1;
  const empaquesComprar =
    aComprar > 0 ? Math.ceil(aComprar / cantidadPorCompra - 1e-9) : 0;
  const aComprarEmpaque = empaquesComprar * cantidadPorCompra;
  // Se aplicó el mínimo cuando la necesidad real cabía en menos de una unidad
  // de compra, así que se sube a 1 (la compra mínima del proveedor).
  const aplicoMinimo = aComprar > 1e-9 && aComprar < cantidadPorCompra - 1e-9;
  const precioCompra = i.precioCompraUsd ?? null;
  const tienePrecio = precioCompra != null && precioCompra > 0;
  const costoCompra = tienePrecio ? empaquesComprar * (precioCompra as number) : 0;
  return {
    insumoId: i.id,
    nombre: i.nombre,
    unidadBase: i.unidadBase,
    ritmoDiario: ritmo,
    sinDatos: ritmo <= 0,
    horizonteDias,
    necesidad,
    procesado,
    crudo,
    mermaPorc,
    faltaProcesar,
    crudoNecesario,
    aComprar,
    unidadCompra: i.unidadCompra,
    cantidadPorCompra,
    empaquesComprar,
    aComprarEmpaque,
    aplicoMinimo,
    costoCompra,
    tienePrecio,
  };
}

/** Plan por demanda de todos los insumos activos que se procesan.
 *  Ordenado por lo más urgente de comprar primero. */
export function planDemanda(
  insumos: Insumo[],
  consumo: Map<string, ConsumoInsumo>,
  ventana: number = VENTANA_RITMO_DIAS,
): LineaPlanDemanda[] {
  return insumos
    .filter((i) => i.activo && i.seProcesa)
    .map((i) => planDemandaInsumo(i, consumo.get(i.id), ventana))
    .sort(
      (a, b) =>
        b.aComprar - a.aComprar ||
        b.faltaProcesar - a.faltaProcesar ||
        a.nombre.localeCompare(b.nombre),
    );
}
