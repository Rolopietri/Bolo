// Cómo entra el IVA de una compra al costo del insumo.
//
// El monto de la factura puede venir sin IVA (la base, y el IVA aparte) o ya
// con IVA. Siempre se separan tres cifras para los reportes fiscales: base,
// IVA y exento. El costo que usan recetas, costeo y precios depende de si el
// negocio recupera ese IVA:
//   • sí (contribuyente ordinario, el valor por defecto): base + exento.
//   • no: base + IVA + exento (lo que se pagó).
// Lo exento no lleva IVA en ningún caso.

export type DesgloseIva = {
  /** Gravable, sin IVA. */
  base: number;
  /** IVA de esa base. */
  iva: number;
  /** Lo que no paga IVA. */
  exento: number;
  /** base + IVA + exento. Lo que se pagó. */
  pagado: number;
  /** Lo que entra al costo del insumo. */
  costo: number;
};

export type ModoIva = "con" | "sin" | "exento";

/** Si la factura no trae IVA impreso, el monto no se parte. */
export function modoIvaDeFactura(f: { iva?: number; base?: number; ivaPorc?: number }): "sin" | "exento" {
  return f.iva !== undefined || f.base !== undefined || f.ivaPorc !== undefined ? "sin" : "exento";
}

export function desgloseIva(input: {
  /** Monto tal como está en la factura, en la moneda en que se esté calculando. */
  monto: number;
  /** "sin": el monto es la base y el IVA va aparte. "con": el monto ya trae el IVA.
   *  "exento": el monto no tiene IVA (no se suma ni se resta). */
  ivaModo: ModoIva;
  exento: boolean;
  /** Porcentaje, por ejemplo 16. */
  ivaPorc: number;
  /** ¿El negocio recupera el IVA de las compras? */
  recuperaIva: boolean;
}): DesgloseIva {
  const monto = Number.isFinite(input.monto) && input.monto > 0 ? input.monto : 0;
  const porc = Number.isFinite(input.ivaPorc) && input.ivaPorc > 0 ? input.ivaPorc : 0;
  let base = 0;
  let iva = 0;
  let exento = 0;
  // "exento" es el caso seguro: el documento no muestra IVA, así que el monto
  // es el costo. No se divide entre 1,16.
  if (input.ivaModo === "exento" || input.exento || porc === 0) {
    exento = monto;
  } else if (input.ivaModo === "sin") {
    base = monto;
    iva = monto * (porc / 100);
  } else {
    const factor = 1 + porc / 100;
    base = monto / factor;
    iva = monto - base;
  }
  const pagado = base + iva + exento;
  const costo = input.recuperaIva ? base + exento : pagado;
  return { base, iva, exento, pagado, costo };
}

/** Cómo mostrar una compra ya guardada en el formulario.
 *  Sin desglose (compra vieja) o sin IVA: "exento", para no dividir el monto.
 *  Con base e IVA: "con", porque el campo muestra lo pagado (base + IVA). */
export function modoIvaDeCompra(c: {
  baseUsd?: number;
  ivaUsd?: number;
  exentoUsd?: number;
}): "con" | "sin" | "exento" {
  const tiene = c.baseUsd != null || c.ivaUsd != null || c.exentoUsd != null;
  if (!tiene) return "exento";
  const base = c.baseUsd ?? 0;
  const iva = c.ivaUsd ?? 0;
  if (iva > 0.0001 && base > 0) return "con";
  return "exento";
}

/** Porcentaje que sale de la base y el IVA guardados, o 16 si no hay. */
export function porcIvaDeCompra(c: { baseUsd?: number; ivaUsd?: number }): string {
  const base = c.baseUsd ?? 0;
  const iva = c.ivaUsd ?? 0;
  if (base > 0 && iva > 0) return String(Math.round((iva / base) * 10000) / 100);
  return "16";
}

/** Precio por kilo a partir del costo de la línea y los kilos comprados. */
export function precioPorKg(costo: number, kg: number): number {
  if (!(kg > 0) || !Number.isFinite(costo)) return 0;
  return costo / kg;
}

/** Desglose ya guardado en una compra. Las viejas no tienen estas columnas. */
export type FiscalGuardado = {
  baseUsd?: number;
  ivaUsd?: number;
  exentoUsd?: number;
  costoUsd?: number;
  precioTotalUsd: number;
};

/** Qué base, IVA, exento y costo se escriben al guardar.
 *  Si la persona no cambió el monto, se conservan los de la compra (editar no
 *  le inventa un IVA). Si los cambió, se recalcula y el costo lo fija la base. */
export function fiscalAlGuardar(opts: {
  recalculado: DesgloseIva;
  original?: FiscalGuardado;
  intacto: boolean;
}): { baseUsd: number; ivaUsd: number; exentoUsd: number; costoUsd: number | null } {
  if (opts.intacto && opts.original) {
    const o = opts.original;
    const tiene = o.baseUsd != null || o.ivaUsd != null || o.exentoUsd != null;
    if (tiene) {
      return {
        baseUsd: o.baseUsd ?? 0,
        ivaUsd: o.ivaUsd ?? 0,
        exentoUsd: o.exentoUsd ?? 0,
        costoUsd: o.costoUsd ?? o.precioTotalUsd,
      };
    }
    return {
      baseUsd: 0,
      ivaUsd: 0,
      exentoUsd: o.precioTotalUsd,
      costoUsd: o.precioTotalUsd,
    };
  }
  return {
    baseUsd: opts.recalculado.base,
    ivaUsd: opts.recalculado.iva,
    exentoUsd: opts.recalculado.exento,
    costoUsd: null,
  };
}

/** La fila que se manda a `compras`. Sin el SQL, la segunda vez se omiten
 *  las columnas del desglose para que el insert igual entre. */
export function filaCompra(
  input: {
    insumoId: string;
    proveedorId?: string;
    fecha: string;
    cantidad: number;
    precioTotalUsd: number;
    precioTotalBs?: number;
    tasaBcvUsada?: number;
    modalidadPago?: string;
    notas?: string;
    numeroFactura?: string;
    fleteUsd?: number;
    pagada?: boolean;
    fechaPago?: string;
    baseUsd?: number;
    ivaUsd?: number;
    exentoUsd?: number;
    costoUsd?: number | null;
  },
  conDesglose: boolean,
): Record<string, unknown> {
  const fila: Record<string, unknown> = {
    insumo_id: input.insumoId,
    proveedor_id: input.proveedorId ?? null,
    fecha: input.fecha,
    cantidad: input.cantidad,
    precio_total_usd: input.precioTotalUsd,
    precio_total_bs: input.precioTotalBs ?? null,
    tasa_bcv_usada: input.tasaBcvUsada ?? null,
    modalidad_pago: input.modalidadPago ?? null,
    notas: input.notas ?? null,
    numero_factura: input.numeroFactura?.trim() || null,
    flete_usd: input.fleteUsd ?? null,
    pagada: input.pagada ?? true,
    fecha_pago: input.pagada === false ? null : (input.fechaPago ?? input.fecha),
  };
  if (conDesglose) {
    fila.base_usd = input.baseUsd ?? null;
    fila.iva_usd = input.ivaUsd ?? null;
    fila.exento_usd = input.exentoUsd ?? null;
    if (input.costoUsd != null) fila.costo_usd = input.costoUsd;
  }
  return fila;
}

/** PostgREST o Postgres dicen que una columna del insert todavía no existe. */
export function esColumnaAusente(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const m = (error.message ?? "").toLowerCase();
  return (
    error.code === "PGRST204" ||
    error.code === "42703" ||
    /could not find the '.+' column/.test(m) ||
    /column .+ does not exist/.test(m)
  );
}

/** La función de reemplazo atómico todavía no está en la base. */
export function esFuncionAusente(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const m = (error.message ?? "").toLowerCase();
  return (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    /could not find the function/.test(m) ||
    /function .+ does not exist/.test(m)
  );
}
