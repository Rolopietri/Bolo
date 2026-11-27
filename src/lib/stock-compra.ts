/** Prefijo estable. La base lo pone al inicio del error; la pantalla lo reconoce. */
export const PREFIJO_STOCK_NEGATIVO = "BOLO_STOCK_NEGATIVO";

export type AlarmaStock = {
  insumo: string;
  /** Stock de ahora, en la unidad base. */
  stock: number;
  unidad: string;
  /** Lo que faltaría para no quedar bajo cero, en la misma unidad. */
  faltante: number;
};

/** Cuánto faltaría si el stock (unidad base) se moviera `deltaBase`.
 *  null si el resultado es cero o más. */
export function faltanteSiBajaStock(stockActual: number, deltaBase: number): number | null {
  const nuevo = stockActual + deltaBase;
  if (nuevo < -1e-9) return -nuevo;
  return null;
}

/** Cambio de stock en unidad base al editar. Si es el mismo insumo, solo
 *  `deltaViejo` (la diferencia). Si cambia el insumo, el viejo pierde toda
 *  la compra y el nuevo la recibe. */
export function deltaStockEdicion(p: {
  mismoInsumo: boolean;
  cantidadVieja: number;
  factorViejo: number;
  cantidadNueva: number;
  factorNuevo: number;
}): { deltaViejo: number; deltaNuevo: number | null } {
  const aportado = p.cantidadVieja * p.factorViejo;
  if (p.mismoInsumo) {
    return { deltaViejo: p.cantidadNueva * p.factorViejo - aportado, deltaNuevo: null };
  }
  return { deltaViejo: -aportado, deltaNuevo: p.cantidadNueva * p.factorNuevo };
}

/** Lee el error de la base. Acepta el prefijo aunque Postgres le ponga texto alrededor. */
export function parseAlarmaStock(mensaje: string): AlarmaStock | null {
  const i = mensaje.indexOf(PREFIJO_STOCK_NEGATIVO);
  if (i < 0) return null;
  const partes = mensaje.slice(i + PREFIJO_STOCK_NEGATIVO.length).split("|");
  if (partes.length < 5 || partes[0] !== "") return null;
  const stock = Number(partes[2]);
  const faltante = Number(partes[4]);
  if (!Number.isFinite(stock) || !Number.isFinite(faltante)) return null;
  return {
    insumo: partes[1] || "Insumo",
    stock,
    unidad: partes[3] || "",
    faltante,
  };
}

function cantidadLegible(value: number, unidad: string): string {
  const u = unidad.trim().toLowerCase();
  const abs = Math.abs(value);
  let n = value;
  let mostrar = unidad;
  if ((u === "g" || u === "gr" || u === "gramos") && abs >= 1000) {
    n = value / 1000;
    mostrar = "kg";
  } else if (u === "ml" && abs >= 1000) {
    n = value / 1000;
    mostrar = "L";
  } else if ((u === "kg" || u === "kilos") && abs > 0 && abs < 1) {
    n = value * 1000;
    mostrar = "g";
  }
  const texto = new Intl.NumberFormat("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  return `${texto} ${mostrar}`.trim();
}

export function textoAlarmaStock(a: AlarmaStock): string {
  const stock = cantidadLegible(a.stock, a.unidad);
  const falta = cantidadLegible(a.faltante, a.unidad);
  return `${a.insumo} tiene ${stock}. Faltarían ${falta}. Ya se usó parte de esta compra, así que no se guardó nada.`;
}

/** Rechazo de stock insuficiente, sin hablar de compras (Telegram, ventas, uso). */
export function textoRechazoStock(a: AlarmaStock): string {
  const stock = cantidadLegible(a.stock, a.unidad);
  const falta = cantidadLegible(a.faltante, a.unidad);
  return `${a.insumo}: en el almacén hay ${stock}; faltarían ${falta}. No se registró el movimiento.`;
}

/** Si el error de la base trae BOLO_STOCK_NEGATIVO, un mensaje claro; si no, el fallback. */
export function respuestaStockNegativo(mensaje: string, fallback: string): string {
  const a = parseAlarmaStock(mensaje);
  return a ? `✕ ${textoRechazoStock(a)}` : fallback;
}
