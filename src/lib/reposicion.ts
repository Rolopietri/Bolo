// Qué conviene pedir hoy, según el stock libre y el mínimo.
//
// El stock libre ya viene de las compras, las ventas y las reservas: aquí no
// se vuelve a calcular el historial. La regla es la misma que las alertas de
// Hoy: sin mínimo (vacío o 0) no entra; libre en 0 es agotado; libre mayor
// que 0 y menor que el mínimo es bajo.
//
// Módulo puro, sin base ni navegador, para probarlo con Node.

export type MotivoReposicion = "agotado" | "bajo";

export type InsumoReposicion = {
  id: string;
  nombre: string;
  activo: boolean;
  unidadCompra: string;
  unidadBase: string;
  cantidadPorCompra: number;
  stockTotal: number;
  stockComprometido: number;
  stockMinimo: number | null;
  precioCompraUsd: number | null;
  proveedorId?: string;
};

export type LineaReposicion = {
  insumoId: string;
  nombre: string;
  unidadCompra: string;
  unidadBase: string;
  /** Cuántas unidades base trae un empaque. Nunca menor que 1. */
  cantidadPorCompra: number;
  proveedorId?: string;
  proveedorNombre?: string;
  stockLibre: number;
  comprometido: number;
  stockMinimo: number;
  motivo: MotivoReposicion;
  /** Cuánto falta, en unidad base, para llegar al mínimo. */
  faltanteBase: number;
  /** Empaques enteros para cubrir ese faltante. */
  empaques: number;
  precioCompraUsd: number | null;
  /** Costo de los empaques sugeridos. null si no hay precio. */
  costoEstimado: number | null;
};

export type ResumenReposicion = {
  lineas: LineaReposicion[];
  insumosActivos: number;
  sinMinimo: number;
};

export type BorradorReposicion = {
  insumoId: string;
  nombre: string;
  proveedorId?: string;
  motivo: MotivoReposicion;
  empaques: number;
  precioUnitarioUsd: number;
};

export type CompraDesdeReposicion = {
  insumoId: string;
  proveedorId?: string;
  fecha: string;
  cantidad: number;
  precioTotalUsd: number;
  notas: string;
  numeroFactura: string;
  pagada: false;
};

function stockLibreDe(i: { stockTotal: number; stockComprometido: number }): number {
  const libre = i.stockTotal - i.stockComprometido;
  return libre > 0 ? libre : 0;
}

/** Empaques enteros para cubrir `faltante` unidades base. */
export function empaquesParaCubrir(faltante: number, cantidadPorCompra: number): number {
  if (!(faltante > 0)) return 0;
  const pack = cantidadPorCompra > 0 ? cantidadPorCompra : 1;
  const n = faltante / pack;
  const redondo = Math.round(n);
  if (Math.abs(n - redondo) < 1e-6) return Math.max(1, redondo);
  return Math.max(1, Math.ceil(n - 1e-9));
}

/** Acepta "1,5" y "1.5". Vacío o texto → null. */
export function leerCantidad(raw: string): number | null {
  const s = raw.trim().replace(/\s/g, "");
  if (!s) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let norm = s;
  if (lastComma >= 0 && lastComma > lastDot) norm = s.replace(/\./g, "").replace(",", ".");
  else if (lastDot >= 0 && lastDot > lastComma) norm = s.replace(/,/g, "");
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

export function sugerirReposicion(
  insumos: InsumoReposicion[],
  proveedores: { id: string; nombre: string }[] = [],
): ResumenReposicion {
  const nombres = new Map(proveedores.map((p) => [p.id, p.nombre]));
  const lineas: LineaReposicion[] = [];
  let insumosActivos = 0;
  let sinMinimo = 0;

  for (const i of insumos) {
    if (!i.activo) continue;
    insumosActivos += 1;
    if (i.stockMinimo === null || !(i.stockMinimo > 0)) {
      sinMinimo += 1;
      continue;
    }
    const libre = stockLibreDe(i);
    if (libre >= i.stockMinimo) continue;
    const pack = i.cantidadPorCompra > 0 ? i.cantidadPorCompra : 1;
    const faltante = i.stockMinimo - libre;
    const empaques = empaquesParaCubrir(faltante, pack);
    const precio =
      i.precioCompraUsd !== null && Number.isFinite(i.precioCompraUsd) && i.precioCompraUsd > 0
        ? i.precioCompraUsd
        : null;
    lineas.push({
      insumoId: i.id,
      nombre: i.nombre,
      unidadCompra: i.unidadCompra,
      unidadBase: i.unidadBase,
      cantidadPorCompra: pack,
      proveedorId: i.proveedorId,
      proveedorNombre: i.proveedorId ? nombres.get(i.proveedorId) : undefined,
      stockLibre: libre,
      comprometido: i.stockComprometido > 0 ? i.stockComprometido : 0,
      stockMinimo: i.stockMinimo,
      motivo: libre <= 0 ? "agotado" : "bajo",
      faltanteBase: faltante,
      empaques,
      precioCompraUsd: precio,
      costoEstimado: precio === null ? null : Number((empaques * precio).toFixed(2)),
    });
  }

  lineas.sort((a, b) => {
    if (a.motivo !== b.motivo) return a.motivo === "agotado" ? -1 : 1;
    return a.nombre.localeCompare(b.nombre, "es");
  });

  return { lineas, insumosActivos, sinMinimo };
}

/** Referencia corta de la compra, hora de Caracas, para agrupar las líneas. */
export function referenciaPedido(ahora = new Date()): string {
  const fecha = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Caracas",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(ahora)
    .replace(/\D/g, "");
  const hora = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Caracas",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(ahora)
    .replace(/\D/g, "")
    .slice(0, 4);
  return `PS-${fecha}-${hora}`;
}

/**
 * Convierte lo aprobado en filas de `compras`. No toca la base: el cliente
 * las inserta con createComprasLote. Quedan por pagar. El precio es obligatorio
 * porque el trigger de compras pisa el costo del insumo con el de esta fila.
 */
export function prepararComprasReposicion(
  lineas: BorradorReposicion[],
  opts: { fecha: string; numeroFactura: string },
): { compras: CompraDesdeReposicion[]; error?: string } {
  if (lineas.length === 0) {
    return { compras: [], error: "Elige al menos un insumo para pedir." };
  }
  const compras: CompraDesdeReposicion[] = [];
  for (const l of lineas) {
    if (!(l.empaques > 0)) {
      return { compras: [], error: `La cantidad de ${l.nombre} tiene que ser mayor que cero.` };
    }
    if (!(l.precioUnitarioUsd > 0)) {
      return {
        compras: [],
        error: `Falta el precio de ${l.nombre}. Sin un precio, la compra dejaría el costo en cero.`,
      };
    }
    compras.push({
      insumoId: l.insumoId,
      proveedorId: l.proveedorId,
      fecha: opts.fecha,
      cantidad: l.empaques,
      precioTotalUsd: Number((l.empaques * l.precioUnitarioUsd).toFixed(2)),
      notas: l.motivo === "agotado" ? "Pedido sugerido · agotado" : "Pedido sugerido · bajo el mínimo",
      numeroFactura: opts.numeroFactura,
      pagada: false,
    });
  }
  return { compras };
}
