// Semana de Administración: cuentas puras, sin base ni navegador.
//
// La semana es lunes a domingo, en el calendario de Caracas. Los montos
// entran ya en dólares. Este módulo no lee Supabase: arma el resumen a
// partir de ventas, compras y pérdidas que la pantalla ya trajo.

// Sin imports a propósito: este archivo lo corre `node` en test:semana, y Node
// no resuelve los alias `@/` ni los imports sin extensión. El formato de dólar
// es el mismo que `fmtUsd` en moneda.ts (el test lo compara). La fecha de
// Caracas es la misma idea que `fechaISOEnCaracas` en stock-liviano.ts.

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

function fmtUsd(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  const s = Math.abs(v).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return v < 0 ? `−$${s}` : `$${s}`;
}

/** YYYY-MM-DD en Caracas. */
function fechaISOEnCaracas(ahora: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Caracas",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora);
}

/** Resta días de calendario a una fecha ISO, sin depender de la zona. */
function restarDiasISO(iso: string, dias: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() - dias);
  return dt.toISOString().slice(0, 10);
}

function partes(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return { y: y || 0, m: m || 1, d: d || 1 };
}

/** 0 = domingo … 6 = sábado, sobre la fecha civil (sin zona). */
function diaSemanaUTC(iso: string): number {
  const { y, m, d } = partes(iso);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Lunes (YYYY-MM-DD) de la semana que contiene `iso`. */
export function lunesDe(iso: string): string {
  const dow = diaSemanaUTC(iso);
  const retro = dow === 0 ? 6 : dow - 1;
  return restarDiasISO(iso.slice(0, 10), retro);
}

/** Domingo de la semana que empieza el lunes `lunes`. */
export function domingoDe(lunes: string): string {
  return restarDiasISO(lunes.slice(0, 10), -6);
}

/** Mueve un lunes N semanas. Positivo = hacia adelante. */
export function moverSemana(lunes: string, deltaSemanas: number): string {
  return restarDiasISO(lunes.slice(0, 10), -7 * deltaSemanas);
}

export function etiquetaSemana(desde: string, hasta: string): string {
  const a = partes(desde);
  const b = partes(hasta);
  const ma = MESES[a.m - 1] ?? "";
  const mb = MESES[b.m - 1] ?? "";
  if (a.y === b.y && a.m === b.m) return `${a.d} al ${b.d} de ${ma} de ${a.y}`;
  if (a.y === b.y) return `${a.d} de ${ma} al ${b.d} de ${mb} de ${a.y}`;
  return `${a.d} de ${ma} de ${a.y} al ${b.d} de ${mb} de ${b.y}`;
}

export type RangoSemana = { desde: string; hasta: string; etiqueta: string };

/** `lunes` tiene que ser lunes. Devuelve lunes–domingo con la etiqueta. */
export function semanaDesdeLunes(lunes: string): RangoSemana {
  const desde = lunes.slice(0, 10);
  const hasta = domingoDe(desde);
  return { desde, hasta, etiqueta: etiquetaSemana(desde, hasta) };
}

/** Lunes de la semana en curso, hora de Caracas. */
export function lunesSemanaActual(ahora = new Date()): string {
  return lunesDe(fechaISOEnCaracas(ahora));
}

/**
 * Variación (actual − anterior) / anterior.
 * null si la semana anterior no tuvo base (0 o no finito): no hay porcentaje.
 */
export function variacion(actual: number, anterior: number): number | null {
  if (!(anterior > 0) || !Number.isFinite(anterior) || !Number.isFinite(actual)) return null;
  return (actual - anterior) / anterior;
}

export type CostoCatalogo = {
  /** receta → costo por porción. Solo entran costos conocidos y positivos. */
  porPorcion: ReadonlyMap<string, number>;
  /** insumo → USD por unidad base (precio base). */
  precioInsumo: ReadonlyMap<string, number>;
};

export type VentaParaCosto = {
  recetaId?: string;
  cantidad: number;
  insumoId?: string;
  /** Cuánto del insumo directo sale por unidad vendida. Vacío = 1. */
  insumoCantidad?: number | null;
  extraRecetaId?: string;
  /** Veces que se descuenta la receta extra por unidad vendida. Vacío = 1. */
  extraCantidad?: number | null;
};

/**
 * Food cost teórico de una línea.
 * Con receta: costo por porción × unidades, más la receta extra si la hay.
 * Sin receta y con insumo directo: precio base × cantidad por unidad × unidades.
 * Servicio, consignación o receta sin costo → null (no se inventa un 0).
 * Una sustitución de insumo no se recostea: se usa el costo de la receta base.
 */
export function costoTeoricoLinea(v: VentaParaCosto, cat: CostoCatalogo): number | null {
  const cant = v.cantidad;
  if (!Number.isFinite(cant) || cant < 0) return null;

  if (v.recetaId) {
    const base = cat.porPorcion.get(v.recetaId);
    if (base == null) return null;
    let total = base * cant;
    if (v.extraRecetaId) {
      const veces = v.extraCantidad == null ? 1 : v.extraCantidad;
      if (!Number.isFinite(veces) || veces < 0) return null;
      if (veces > 0) {
        const extra = cat.porPorcion.get(v.extraRecetaId);
        if (extra == null) return null;
        total += extra * veces * cant;
      }
    }
    return total;
  }

  if (v.insumoId) {
    const precio = cat.precioInsumo.get(v.insumoId);
    if (precio == null) return null;
    const por = v.insumoCantidad == null ? 1 : v.insumoCantidad;
    if (!Number.isFinite(por) || por < 0) return null;
    return precio * por * cant;
  }

  return null;
}

/** USD de la línea: el total guardado, o precio × cantidad si el total falta. */
export function montoVenta(v: {
  totalUsd?: number | null;
  precioUnitarioUsd?: number | null;
  cantidad: number;
}): number {
  if (v.totalUsd != null && Number.isFinite(v.totalUsd)) return v.totalUsd;
  if (
    v.precioUnitarioUsd != null &&
    Number.isFinite(v.precioUnitarioUsd) &&
    Number.isFinite(v.cantidad)
  ) {
    return v.precioUnitarioUsd * v.cantidad;
  }
  return 0;
}

/**
 * USD de una baja. Manda el valor congelado al registrarla.
 * Si no existe, se estima con el precio base actual × cantidad (en positivo).
 */
export function valorPerdida(
  m: { valorUsd?: number | null; cantidad: number },
  precioUnitario: number | null,
): number | null {
  if (m.valorUsd != null && Number.isFinite(m.valorUsd)) return Math.abs(m.valorUsd);
  if (precioUnitario == null || !Number.isFinite(precioUnitario) || precioUnitario < 0) return null;
  if (!Number.isFinite(m.cantidad)) return null;
  return Math.abs(m.cantidad) * precioUnitario;
}

export function totalesCompra(
  compras: { precioTotalUsd: number; fleteUsd?: number | null }[],
): { insumos: number; flete: number } {
  let insumos = 0;
  let flete = 0;
  for (const c of compras) {
    if (Number.isFinite(c.precioTotalUsd)) insumos += c.precioTotalUsd;
    if (c.fleteUsd != null && Number.isFinite(c.fleteUsd)) flete += c.fleteUsd;
  }
  return { insumos, flete };
}

export function sumarPerdidas(valores: (number | null)[]): { usd: number; sinPrecio: number } {
  let usd = 0;
  let sinPrecio = 0;
  for (const v of valores) {
    if (v == null || !Number.isFinite(v)) sinPrecio += 1;
    else usd += v;
  }
  return { usd, sinPrecio };
}

function cerca(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(1, Math.max(Math.abs(a), Math.abs(b)) * 0.05);
}

/** Una línea, en español, sobre la diferencia entre costo de receta y compras. */
export function explicarFoodCost(teorico: number, insumos: number, flete: number): string {
  const compras = insumos + flete;
  const poco = (n: number) => !(n > 0.005);
  if (poco(teorico) && poco(compras)) return "";
  if (poco(teorico) && !poco(compras)) {
    return "Hubo compras y las ventas no tienen costo de receta. Ese dinero quedó en inventario, o los platos todavía no tienen receta costeada.";
  }
  if (!poco(teorico) && poco(compras)) {
    return "Lo vendido tiene costo de receta y no hubo compras. Se usó inventario que ya estaba en cámara.";
  }
  if (cerca(insumos, teorico) && flete > 0.005) {
    return "El costo de lo vendido y las compras de insumos van parejos. Lo que sobra es el flete.";
  }
  if (cerca(compras, teorico)) {
    return "Las compras y el costo de lo vendido van parejos esta semana.";
  }
  const diff = compras - teorico;
  if (diff > 0) {
    return `Compraste ${fmtUsd(diff)} más de lo que costaron los platos vendidos. La diferencia suele quedar en cámara.`;
  }
  return `Lo vendido costó ${fmtUsd(-diff)} más que las compras de la semana. Se usó inventario de antes.`;
}

export type LineaSemana = {
  nombre: string;
  cantidad: number;
  totalUsd: number;
  /** null = esta línea no se pudo costear. */
  costoUsd: number | null;
};

export type PlatoSemana = {
  nombre: string;
  cantidad: number;
  ventasUsd: number;
  costoUsd: number | null;
  margenUsd: number | null;
  /** Margen sobre la venta del plato. null si no hay venta o falta costo. */
  margenPct: number | null;
  /** Margen por unidad. null si no se puede. */
  margenUnitarioUsd: number | null;
};

export type ResumenSemana = {
  ventasUsd: number;
  platos: number;
  ventasAnteriorUsd: number;
  platosAnterior: number;
  variacionVentas: number | null;
  variacionPlatos: number | null;
  top: PlatoSemana[];
  foodCostUsd: number;
  foodCostPct: number | null;
  ventasSinCostoUsd: number;
  platosSinCosto: number;
  comprasInsumosUsd: number;
  fleteUsd: number;
  comprasUsd: number;
  comprasPct: number | null;
  explicacion: string;
  perdidasUsd: number;
  perdidasSinPrecio: number;
  utilidadUsd: number;
  hayVentas: boolean;
  hayCompras: boolean;
};

function num(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

function pctDe(parte: number, total: number): number | null {
  if (!(total > 0) || !Number.isFinite(parte)) return null;
  return parte / total;
}

/**
 * Arma el resumen de una semana ya recortada.
 * `comprasInsumosUsd` es el costo de los insumos; el flete va aparte y suma
 * a las compras reales. La utilidad es ventas − food cost teórico − pérdidas.
 */
export function armarSemana(input: {
  ventas: LineaSemana[];
  ventasAnterior: LineaSemana[];
  comprasInsumosUsd: number;
  fleteUsd: number;
  perdidasUsd: number;
  perdidasSinPrecio: number;
}): ResumenSemana {
  let ventasUsd = 0;
  let platos = 0;
  let foodCostUsd = 0;
  let ventasSinCostoUsd = 0;
  let platosSinCosto = 0;

  type Acc = {
    nombre: string;
    cantidad: number;
    ventasUsd: number;
    costoUsd: number;
    completo: boolean;
  };
  const porNombre = new Map<string, Acc>();

  for (const v of input.ventas) {
    const nombre = v.nombre.trim() || "Sin nombre";
    const cantidad = num(v.cantidad);
    const total = num(v.totalUsd);
    ventasUsd += total;
    platos += cantidad;
    const sinCosto = v.costoUsd == null || !Number.isFinite(v.costoUsd);
    if (sinCosto) {
      ventasSinCostoUsd += total;
      platosSinCosto += cantidad;
    } else {
      foodCostUsd += v.costoUsd as number;
    }
    const cur = porNombre.get(nombre) ?? {
      nombre,
      cantidad: 0,
      ventasUsd: 0,
      costoUsd: 0,
      completo: true,
    };
    cur.cantidad += cantidad;
    cur.ventasUsd += total;
    if (sinCosto) cur.completo = false;
    else cur.costoUsd += v.costoUsd as number;
    porNombre.set(nombre, cur);
  }

  let ventasAnteriorUsd = 0;
  let platosAnterior = 0;
  for (const v of input.ventasAnterior) {
    ventasAnteriorUsd += num(v.totalUsd);
    platosAnterior += num(v.cantidad);
  }

  const top = Array.from(porNombre.values())
    .sort(
      (a, b) =>
        b.cantidad - a.cantidad ||
        b.ventasUsd - a.ventasUsd ||
        a.nombre.localeCompare(b.nombre, "es"),
    )
    .slice(0, 5)
    .map((a): PlatoSemana => {
      const costoUsd = a.completo ? a.costoUsd : null;
      const margenUsd = costoUsd == null ? null : a.ventasUsd - costoUsd;
      return {
        nombre: a.nombre,
        cantidad: a.cantidad,
        ventasUsd: a.ventasUsd,
        costoUsd,
        margenUsd,
        margenPct: margenUsd == null || !(a.ventasUsd > 0) ? null : margenUsd / a.ventasUsd,
        margenUnitarioUsd:
          margenUsd == null || !(a.cantidad > 0) ? null : margenUsd / a.cantidad,
      };
    });

  const comprasInsumosUsd = num(input.comprasInsumosUsd);
  const fleteUsd = num(input.fleteUsd);
  const comprasUsd = comprasInsumosUsd + fleteUsd;
  const perdidasUsd = num(input.perdidasUsd);

  return {
    ventasUsd,
    platos,
    ventasAnteriorUsd,
    platosAnterior,
    variacionVentas: variacion(ventasUsd, ventasAnteriorUsd),
    variacionPlatos: variacion(platos, platosAnterior),
    top,
    foodCostUsd,
    foodCostPct: pctDe(foodCostUsd, ventasUsd),
    ventasSinCostoUsd,
    platosSinCosto,
    comprasInsumosUsd,
    fleteUsd,
    comprasUsd,
    comprasPct: pctDe(comprasUsd, ventasUsd),
    explicacion: explicarFoodCost(foodCostUsd, comprasInsumosUsd, fleteUsd),
    perdidasUsd,
    perdidasSinPrecio: input.perdidasSinPrecio > 0 ? input.perdidasSinPrecio : 0,
    utilidadUsd: ventasUsd - foodCostUsd - perdidasUsd,
    hayVentas: input.ventas.length > 0,
    hayCompras: comprasUsd > 0.005,
  };
}
