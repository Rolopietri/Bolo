// Gastos fijos de Administración: cuentas puras, sin base ni navegador.
//
// Un gasto fijo no es un egreso de caja. El egreso es un pago de un día
// (admin_egreso). El fijo es el compromiso: alquiler, nómina, servicios, gas
// u otro, de una sola vez o todos los meses a partir de una fecha.
//
// La misma función arma la semana, el mes del Estado de cuenta, el histórico
// y el análisis. Así las cifras coinciden.
//
// Semana: el monto mensual se reparte entre los días del mes
//   (monto × días de la semana que caen en ese mes ÷ días del mes).
//   Si la semana cruza de mes, se suman las dos partes.
// Mes completo: el monto entero. La suma de las semanas del mes da ese monto.
// Un gasto de una sola vez entra completo el día de su fecha, sin prorrateo.
//
// No se cuenta dos veces: un egreso ya clasificado como fijo, de la misma
// categoría y en un mes que ya cubre un gasto fijo, se deja fuera. Un egreso
// variable (por ejemplo el gas de un día anotado en Servicios) sigue contando.

export const CATEGORIAS_GASTO = [
  { id: "alquiler", label: "Alquiler" },
  { id: "nomina", label: "Nómina" },
  { id: "servicios", label: "Servicios" },
  { id: "gas", label: "Gas" },
  { id: "otro", label: "Otro" },
] as const;

export type CategoriaGasto = (typeof CATEGORIAS_GASTO)[number]["id"];

export type MonedaGasto = "USD" | "Bs";

export type GastoFijo = {
  id: string;
  categoria: CategoriaGasto;
  monto: number;
  moneda: MonedaGasto;
  tasa: number | null;
  montoUsd: number;
  fecha: string;
  nota: string | null;
  recurrente: boolean;
};

export type FilaGasto = {
  categoria: CategoriaGasto;
  label: string;
  usd: number;
};

/** Montos del seed de prueba. Octubre completo = 1.800. Semana del 2 al 8 nov = 420. */
export const GASTOS_PRUEBA: {
  categoria: CategoriaGasto;
  monto: number;
  moneda: MonedaGasto;
  fecha: string;
  recurrente: boolean;
  titulo: string;
}[] = [
  { categoria: "alquiler", monto: 900, moneda: "USD", fecha: "2026-10-01", recurrente: true, titulo: "Alquiler del local" },
  { categoria: "nomina", monto: 600, moneda: "USD", fecha: "2026-10-01", recurrente: true, titulo: "Nómina del mes" },
  { categoria: "servicios", monto: 300, moneda: "USD", fecha: "2026-10-01", recurrente: true, titulo: "Servicios del mes" },
];

export const CRITERIO_SEMANA =
  "El gasto mensual se reparte entre los días del mes. Esta semana toma los días que caen aquí (monto × esos días ÷ días del mes). Si la semana cruza de mes, se suman las dos partes. Un gasto de un solo día entra completo. En el mes, Estado de cuenta descuenta el monto entero.";

const ETIQUETA = new Map(CATEGORIAS_GASTO.map((c) => [c.id, c.label]));

function sinAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export function redondearUsd(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

export function esCategoriaGasto(v: string): v is CategoriaGasto {
  return ETIQUETA.has(v as CategoriaGasto);
}

export function etiquetaCategoria(id: CategoriaGasto): string {
  return ETIQUETA.get(id) ?? id;
}

/** Nombre libre de un egreso → categoría de gasto fijo, si coincide exactamente. */
export function categoriaDeNombre(nombre: string | null | undefined): CategoriaGasto | null {
  const k = sinAcento(nombre ?? "");
  if (k === "alquiler") return "alquiler";
  if (k === "nomina") return "nomina";
  if (k === "servicios" || k === "servicio") return "servicios";
  if (k === "gas") return "gas";
  if (k === "otro" || k === "otros") return "otro";
  return null;
}

export function esClasificacionFija(c: string | null | undefined): boolean {
  const k = sinAcento(c ?? "");
  return k === "fija" || k === "fijo";
}

/**
 * Dólares de un monto anotado en USD o en Bs.
 * Bs ÷ tasa BCV de la fecha (bolívares por dólar). Sin tasa, no se inventa.
 */
export function usdDesdeMonto(monto: number, moneda: MonedaGasto, tasa: number | null): number | null {
  if (!Number.isFinite(monto) || monto < 0) return null;
  if (moneda === "USD") return redondearUsd(monto);
  if (!(tasa != null && tasa > 0)) return null;
  return redondearUsd(monto / tasa);
}

function partes(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return { y: y || 0, m: m || 1, d: d || 1 };
}

function isoDe(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function diasDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

export function rangoMes(mes: string): { desde: string; hasta: string } {
  const { y, m } = partes(`${mes}-01`);
  const dias = diasDelMes(y, m);
  return { desde: isoDe(y, m, 1), hasta: isoDe(y, m, dias) };
}

type Trozo = { mes: string; dias: number; diasMes: number; desde: string; hasta: string };

/** Parte un rango inclusivo en los días que caen en cada mes. */
export function trozosDelRango(desde: string, hasta: string): Trozo[] {
  const a = desde.slice(0, 10);
  const b = hasta.slice(0, 10);
  if (!a || !b || a > b) return [];
  const ini = partes(a);
  const fin = partes(b);
  const out: Trozo[] = [];
  let y = ini.y;
  let m = ini.m;
  while (y < fin.y || (y === fin.y && m <= fin.m)) {
    const diasMes = diasDelMes(y, m);
    const mes = `${y}-${String(m).padStart(2, "0")}`;
    const primero = isoDe(y, m, 1);
    const ultimo = isoDe(y, m, diasMes);
    const desdeMes = a > primero ? a : primero;
    const hastaMes = b < ultimo ? b : ultimo;
    const dias = partes(hastaMes).d - partes(desdeMes).d + 1;
    out.push({ mes, dias, diasMes, desde: desdeMes, hasta: hastaMes });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

function mesDe(iso: string): string {
  return iso.slice(0, 7);
}

/** El mes ya está dentro del compromiso (desde la fecha, y los siguientes si se repite). */
export function gastoCubreMes(g: GastoFijo, mes: string): boolean {
  if (!(g.montoUsd > 0)) return false;
  const inicio = mesDe(g.fecha);
  if (g.recurrente) return mes >= inicio;
  return mes === inicio;
}

/**
 * Días del trozo que el gasto realmente cubre.
 * En el mes de arranque, solo desde la fecha. Después, el trozo entero.
 */
function diasCubiertos(g: GastoFijo, t: Trozo): number {
  const inicio = g.fecha.slice(0, 10);
  const mesInicio = mesDe(inicio);
  if (t.mes < mesInicio) return 0;
  if (!g.recurrente) return 0;
  if (t.mes > mesInicio) return t.dias;
  const desdeReal = inicio > t.desde ? inicio : t.desde;
  if (desdeReal > t.hasta) return 0;
  return partes(t.hasta).d - partes(desdeReal).d + 1;
}

/** Dólares del gasto que caen en el rango, ya redondeados al centavo. */
export function usdEnRango(g: GastoFijo, desde: string, hasta: string): number {
  if (!(g.montoUsd > 0)) return 0;
  const a = desde.slice(0, 10);
  const b = hasta.slice(0, 10);
  if (!g.recurrente) {
    const f = g.fecha.slice(0, 10);
    return f >= a && f <= b ? redondearUsd(g.montoUsd) : 0;
  }
  let total = 0;
  for (const t of trozosDelRango(a, b)) {
    const dias = diasCubiertos(g, t);
    if (dias <= 0) continue;
    if (dias >= t.diasMes) total += g.montoUsd;
    else total += (g.montoUsd * dias) / t.diasMes;
  }
  return redondearUsd(total);
}

export function resumirGastos(gastos: GastoFijo[], desde: string, hasta: string): { totalUsd: number; porCategoria: FilaGasto[] } {
  const map = new Map<CategoriaGasto, number>();
  for (const g of gastos) {
    const usd = usdEnRango(g, desde, hasta);
    if (usd <= 0) continue;
    map.set(g.categoria, redondearUsd((map.get(g.categoria) ?? 0) + usd));
  }
  const porCategoria = CATEGORIAS_GASTO.filter((c) => (map.get(c.id) ?? 0) > 0.004).map((c) => ({
    categoria: c.id,
    label: c.label,
    usd: map.get(c.id) ?? 0,
  }));
  const totalUsd = redondearUsd(porCategoria.reduce((s, c) => s + c.usd, 0));
  return { totalUsd, porCategoria };
}

export type EgresoParaFijo = {
  fecha?: string | null;
  categoria?: string | null;
  clasificacion?: string | null;
};

/**
 * True si este egreso es el mismo gasto fijo ya anotado en el mes:
 * clasificación fija y categoría que un gasto fijo cubre ese mes.
 * Un egreso variable no se toca.
 */
export function egresoCubiertoPorFijo(e: EgresoParaFijo, gastos: GastoFijo[]): boolean {
  if (!esClasificacionFija(e.clasificacion)) return false;
  const cat = categoriaDeNombre(e.categoria);
  if (!cat || !e.fecha) return false;
  const mes = mesDe(e.fecha);
  return gastos.some((g) => g.categoria === cat && gastoCubreMes(g, mes));
}

/** Utilidad (o balance) antes y después de restar los gastos fijos del período. */
export function restarGastos(antes: number, gastosUsd: number): { antes: number; gastosUsd: number; despues: number } {
  const a = Number.isFinite(antes) ? antes : 0;
  const g = Number.isFinite(gastosUsd) && gastosUsd > 0 ? gastosUsd : 0;
  return { antes: a, gastosUsd: g, despues: a - g };
}

type FilaDb = {
  id?: string | null;
  categoria?: string | null;
  monto?: number | string | null;
  moneda?: string | null;
  tasa?: number | string | null;
  monto_usd?: number | string | null;
  fecha?: string | null;
  nota?: string | null;
  recurrente?: boolean | null;
};

function num(v: number | string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Fila de admin_gasto_fijo → gasto. Null si la categoría no es de las cinco. */
export function gastoDesdeFila(row: FilaDb): GastoFijo | null {
  const categoria = row.categoria ?? "";
  if (!esCategoriaGasto(categoria)) return null;
  const fecha = (row.fecha ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null;
  const moneda: MonedaGasto = row.moneda === "Bs" ? "Bs" : "USD";
  const monto = num(row.monto) ?? 0;
  const tasa = num(row.tasa);
  const guardado = num(row.monto_usd);
  const montoUsd = guardado != null ? redondearUsd(guardado) : (usdDesdeMonto(monto, moneda, tasa) ?? 0);
  return {
    id: row.id ?? "",
    categoria,
    monto,
    moneda,
    tasa: tasa != null && tasa > 0 ? tasa : null,
    montoUsd,
    fecha,
    nota: row.nota ?? null,
    recurrente: row.recurrente === true,
  };
}
