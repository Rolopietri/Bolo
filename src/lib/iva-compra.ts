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

export function desgloseIva(input: {
  /** Monto tal como está en la factura, en la moneda en que se esté calculando. */
  monto: number;
  /** "sin": el monto es la base. "con": el monto ya trae el IVA. */
  ivaModo: "con" | "sin";
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
  if (input.exento || porc === 0) {
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

/** Precio por kilo a partir del costo de la línea y los kilos comprados. */
export function precioPorKg(costo: number, kg: number): number {
  if (!(kg > 0) || !Number.isFinite(costo)) return 0;
  return costo / kg;
}
