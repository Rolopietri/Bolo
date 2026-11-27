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

const RE_NOTA_IVA = /IVA\s+(\d+(?:[.,]\d+)?)\s*%\s*(agregado|incluido|aparte)?/i;

/** Lo que dice la nota automática ("IVA 16% agregado", "incluido", "aparte").
 *  Las compras viejas no tienen base/IVA/exento: la nota es el único rastro. */
function modoDeNota(notas?: string | null): ModoIva | null {
  const m = notas?.match(RE_NOTA_IVA);
  if (!m) return null;
  if (!m[2] || /agregado|incluido/i.test(m[2])) return "con";
  return "sin";
}

function porcDeNota(notas?: string | null): string | null {
  const m = notas?.match(RE_NOTA_IVA);
  return m ? m[1].replace(",", ".") : null;
}

/** Cómo mostrar una compra ya guardada en el formulario.
 *  Con base e IVA: "con", porque el campo muestra lo pagado (base + IVA).
 *  Sin esas columnas, se lee la nota ("IVA 16% agregado" abre en Con IVA).
 *  Si no hay nada de eso: "exento", para no dividir el monto. */
export function modoIvaDeCompra(c: {
  baseUsd?: number | null;
  ivaUsd?: number | null;
  exentoUsd?: number | null;
  notas?: string | null;
}): ModoIva {
  const tiene = c.baseUsd != null || c.ivaUsd != null || c.exentoUsd != null;
  const deNota = modoDeNota(c.notas);
  if (tiene) {
    const base = c.baseUsd ?? 0;
    const iva = c.ivaUsd ?? 0;
    if (iva > 0.0001 && base > 0) return "con";
    // Un guardado anterior dejó exento = total en una compra que la nota
    // describe como con IVA. El formulario abre como dice la nota.
    if (iva <= 0.0001 && base <= 0.0001 && deNota) return deNota;
    return "exento";
  }
  return deNota ?? "exento";
}

/** Porcentaje que sale de la base y el IVA guardados, de la nota, o 16. */
export function porcIvaDeCompra(c: {
  baseUsd?: number | null;
  ivaUsd?: number | null;
  notas?: string | null;
}): string {
  const base = c.baseUsd ?? 0;
  const iva = c.ivaUsd ?? 0;
  if (base > 0 && iva > 0) return String(Math.round((iva / base) * 10000) / 100);
  return porcDeNota(c.notas) ?? "16";
}

/** Frase que se agrega a las notas, según el modo elegido.
 *  "Con IVA" dice incluido; "IVA aparte" dice aparte. Sin IVA, nada. */
export function notaIvaAutomatica(
  modo: ModoIva,
  porc: number,
  recupera: boolean,
  hayIva: boolean,
): string | null {
  if (modo === "exento" || !hayIva) return null;
  const como = modo === "con" ? "incluido" : "aparte";
  const costo = recupera ? "no entra en el costo" : "entra en el costo";
  const n = Number.isFinite(porc) ? porc : 0;
  return `IVA ${n}% ${como}, ${costo}`;
}

/** Notas al guardar. Si no se tocó el monto, se dejan como estaban.
 *  Si se tocó, la frase automática se reescribe para que diga el modo. */
export function notasConIva(notas: string, notaIva: string | null, intacto: boolean): string | undefined {
  const texto = notas.trim();
  if (intacto) return texto || undefined;
  const sinAuto = texto
    .split(" · ")
    .map((p) => p.trim())
    .filter((p) => p && !/^IVA\s+\d+(?:[.,]\d+)?\s*%\s+(aparte|incluido|agregado)\b/i.test(p))
    .join(" · ");
  if (!notaIva) return sinAuto || undefined;
  return [sinAuto || null, notaIva].filter(Boolean).join(" · ") || undefined;
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
 *  Si la persona no cambió el monto, se conservan los de la compra. Una compra
 *  vieja (sin desglose) no se anota como exento = total: esas columnas siguen
 *  vacías y el precio sigue saliendo de lo pagado. Si los cambió, se recalcula
 *  y el costo lo fija la base. */
export function fiscalAlGuardar(opts: {
  recalculado: DesgloseIva;
  original?: FiscalGuardado;
  intacto: boolean;
  notas?: string | null;
}): { baseUsd: number | null; ivaUsd: number | null; exentoUsd: number | null; costoUsd: number | null } {
  if (opts.intacto && opts.original) {
    const o = opts.original;
    const tiene = o.baseUsd != null || o.ivaUsd != null || o.exentoUsd != null;
    const notaDiceIva = modoDeNota(opts.notas) === "con";
    const exentoEsElTotal =
      (o.ivaUsd ?? 0) <= 0.0001 &&
      (o.baseUsd ?? 0) <= 0.0001 &&
      o.exentoUsd != null &&
      Math.abs(o.exentoUsd - o.precioTotalUsd) < 0.02;
    // Sin columnas, o un exento inventado sobre una nota que dice "IVA agregado".
    if (!tiene || (exentoEsElTotal && notaDiceIva)) {
      return {
        baseUsd: null,
        ivaUsd: null,
        exentoUsd: null,
        costoUsd: o.costoUsd ?? o.precioTotalUsd,
      };
    }
    return {
      baseUsd: o.baseUsd ?? 0,
      ivaUsd: o.ivaUsd ?? 0,
      exentoUsd: o.exentoUsd ?? 0,
      costoUsd: o.costoUsd ?? o.precioTotalUsd,
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
    fechaDocumento?: string | null;
    cantidad: number;
    precioTotalUsd: number;
    precioTotalBs?: number;
    tasaBcvUsada?: number;
    modalidadPago?: string;
    notas?: string;
    numeroFactura?: string;
    fleteUsd?: number;
    pagada?: boolean;
    /** undefined: compra nueva, se usa la fecha de la compra. null: se conserva vacío. */
    fechaPago?: string | null;
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
    fecha_documento: input.fechaDocumento ?? null,
    cantidad: input.cantidad,
    precio_total_usd: input.precioTotalUsd,
    precio_total_bs: input.precioTotalBs ?? null,
    tasa_bcv_usada: input.tasaBcvUsada ?? null,
    modalidad_pago: input.modalidadPago ?? null,
    notas: input.notas ?? null,
    numero_factura: input.numeroFactura?.trim() || null,
    flete_usd: input.fleteUsd ?? null,
    pagada: input.pagada ?? true,
    fecha_pago:
      input.pagada === false
        ? null
        : input.fechaPago !== undefined
          ? input.fechaPago
          : input.fecha,
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
