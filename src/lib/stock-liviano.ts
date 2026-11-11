// Stock de un vistazo: valor en cámara y días hasta agotarse.
//
// El estado (agotado / bajo / OK / sin mínimo) usa la misma regla que Hoy,
// las alertas y Qué pedir: sin mínimo (vacío o 0) no es alerta; el stock
// libre es total − reservado y nunca baja de 0; libre en 0 es agotado;
// libre mayor que 0 y menor que el mínimo es bajo.
//
// Los días no se inventan. Salen del consumo ya registrado (ventas, mermas
// de producción y pérdidas) en una ventana fija. Hacen falta salidas en al
// menos dos días distintos. Si no, queda "Sin datos de consumo".
//
// Módulo puro, sin base ni navegador, para probarlo con Node.

/** Días de calendario hacia atrás, hoy incluido, para el promedio. */
export const VENTANA_CONSUMO_DIAS = 14;

/** Menos de esto no alcanza para un promedio diario. */
export const MIN_DIAS_CON_CONSUMO = 2;

/** Por debajo de esto, y con un promedio real, se marca "se acaba pronto". */
export const DIAS_SE_AGOTA_PRONTO = 3;

export type EstadoStock = "agotado" | "bajo" | "ok" | "sin_minimo";

export type InsumoStock = {
  id: string;
  nombre: string;
  activo: boolean;
  /**
   * Categoría de compra, cruda o ya agrupada. `lineaStock` la normaliza
   * a un grupo de restaurante (ver `grupoCategoriaStock`).
   */
  categoria: string;
  unidadBase: string;
  stockTotal: number;
  stockComprometido: number;
  stockMinimo: number | null;
  precioBaseUsd: number | null;
  precioCompraUsd: number | null;
  cantidadPorCompra: number;
};

/** Salida ya en unidad base. Positivo = se fue; negativo = volvió (un swap). */
export type SalidaStock = {
  insumoId: string;
  /** YYYY-MM-DD */
  fecha: string;
  cantidad: number;
};

export type VentaParaStock = {
  fecha: string;
  cantidad: number;
  recetaId?: string;
  insumoId?: string;
  /** Cuánto del insumo directo sale por unidad vendida. Vacío = 1, como la base. */
  insumoCantidad?: number | null;
  extraRecetaId?: string;
  extraCantidad?: number | null;
  swapFromInsumoId?: string;
  swapToInsumoId?: string | null;
};

export type ExpandirReceta = (
  recetaId: string,
  raciones: number,
) => Iterable<readonly [string, number]>;

/**
 * Tipos de `stock_movimientos` que sí son consumo. El conteo (ajuste),
 * la compra y las reservas no entran: no son un ritmo de salida.
 * Completar un plan tampoco: el stock sale cuando se vende o se pierde.
 */
export const TIPOS_SALIDA_STOCK = [
  "perdida",
  "mal_estado",
  "merma",
  "vencimiento",
  "otro",
  "venta",
  "merma_receta",
] as const;

const TIPOS_SALIDA = new Set<string>(TIPOS_SALIDA_STOCK);

export type ConsumoInsumo = {
  /** Neto que salió en la ventana. Puede ser 0 o negativo si solo hubo devoluciones. */
  total: number;
  /** Días de la ventana con salida neta positiva. */
  diasConConsumo: number;
};

export type EstimacionDias =
  | { estado: "agotado" }
  | { estado: "sin_datos" }
  | { estado: "estimado"; dias: number; promedioDiario: number; consumido: number };

export type LineaStock = {
  id: string;
  nombre: string;
  /** Grupo de restaurante, o "Sin categoría". No es el texto crudo de la base. */
  categoria: string;
  unidadBase: string;
  libre: number;
  comprometido: number;
  stockFisico: number;
  minimo: number | null;
  estado: EstadoStock;
  /** null si no hay un costo usable. El 0 es un stock vacío con costo conocido. */
  valorUsd: number | null;
  /** USD por unidad base. null si el insumo no tiene un costo usable. */
  costoUnitarioUsd: number | null;
  dias: EstimacionDias;
  seAgotaPronto: boolean;
};

export type ResumenStock = {
  activos: number;
  agotados: number;
  bajos: number;
  sinMinimo: number;
  seAgotanPronto: number;
  valorUsd: number;
  /** Con stock en cámara y sin costo: no entran en el valor. */
  sinCosto: number;
  conConsumo: number;
};

export type OrdenStock = "pronto" | "valor" | "nombre" | "estado";

export type FiltroEstadoStock = "todos" | EstadoStock | "pronto";

export type FiltroStock = {
  texto: string;
  /** "todas", "__sin__" o el nombre de la categoría. */
  categoria: string;
  estado: FiltroEstadoStock;
};

export type PreferenciaTasa = "bcv" | "euro" | "promedio" | "usdt" | "personalizada";

export type OrigenTasaStock = "bcv" | "promedio" | "personalizada";

const EPS = 1e-9;

/** Igual que `stockLibre` en types.ts: total − reservado, nunca negativo. */
function stockLibreDe(i: { stockTotal: number; stockComprometido: number }): number {
  return Math.max(0, i.stockTotal - i.stockComprometido);
}

/** Igual que `normalizarBusqueda` en text.ts, para que "azucar" encuentre "Azúcar". */
function normalizarBusqueda(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function positivo(n: number | null | undefined): number | null {
  return n != null && Number.isFinite(n) && n > 0 ? n : null;
}

/** Misma regla que Hoy y Qué pedir. */
export function clasificarStock(libre: number, minimo: number | null): EstadoStock {
  if (minimo === null || minimo === 0) return "sin_minimo";
  if (!(libre > 0)) return "agotado";
  if (libre < minimo) return "bajo";
  return "ok";
}

/**
 * Grupos cortos para leer el stock de un restaurante. El texto guardado en
 * la base no se modifica: esto solo decide cómo se muestra y cómo se suma
 * el valor. Mayúsculas, acentos y sinónimos caen en el mismo grupo.
 *
 *   Proteínas                  carne, pollo, pescado, huevos, embutidos
 *   Lácteos                    lacteo, leche, queso, yogurt, crema
 *   Vegetales y frutas         vegetal, verdura, fruta, "Frutas & Vegetales"
 *   Secos y granos             secos, granos, harinas, abarrotes, aceites,
 *                              panadería, condimentos, salsas
 *   Bebidas                    bebidas, café, té, jugos, refrescos
 *   Limpieza y desechables     limpieza, aseo, desechables, empaques
 *   Otros                      lo que tiene nombre y no entra arriba (snacks…)
 *   Sin categoría              vacío, o "sin categoría" / "sin clasificar"
 *
 * Si el texto contiene varias pistas ("lácteos y huevos"), gana la frase
 * más larga. Un grupo ya normalizado vuelve a sí mismo.
 */
export const GRUPOS_CATEGORIA_STOCK = [
  "Proteínas",
  "Lácteos",
  "Vegetales y frutas",
  "Secos y granos",
  "Bebidas",
  "Limpieza y desechables",
  "Otros",
] as const;

export type GrupoCategoriaStock = (typeof GRUPOS_CATEGORIA_STOCK)[number];

export const SIN_CATEGORIA_STOCK = "Sin categoría";

const ALIAS_GRUPO: Record<string, GrupoCategoriaStock> = {
  proteina: "Proteínas",
  proteinas: "Proteínas",
  carne: "Proteínas",
  carnes: "Proteínas",
  ave: "Proteínas",
  aves: "Proteínas",
  pollo: "Proteínas",
  pescado: "Proteínas",
  pescados: "Proteínas",
  marisco: "Proteínas",
  mariscos: "Proteínas",
  huevo: "Proteínas",
  huevos: "Proteínas",
  embutido: "Proteínas",
  embutidos: "Proteínas",
  charcuteria: "Proteínas",
  fiambre: "Proteínas",
  fiambres: "Proteínas",

  lacteo: "Lácteos",
  lacteos: "Lácteos",
  leche: "Lácteos",
  leches: "Lácteos",
  queso: "Lácteos",
  quesos: "Lácteos",
  yogurt: "Lácteos",
  yogur: "Lácteos",
  yogures: "Lácteos",
  mantequilla: "Lácteos",
  crema: "Lácteos",
  cremas: "Lácteos",

  vegetal: "Vegetales y frutas",
  vegetales: "Vegetales y frutas",
  verdura: "Vegetales y frutas",
  verduras: "Vegetales y frutas",
  fruta: "Vegetales y frutas",
  frutas: "Vegetales y frutas",
  hortaliza: "Vegetales y frutas",
  hortalizas: "Vegetales y frutas",
  hierba: "Vegetales y frutas",
  hierbas: "Vegetales y frutas",
  produce: "Vegetales y frutas",
  "frutas y vegetales": "Vegetales y frutas",
  "vegetales y frutas": "Vegetales y frutas",
  "frutas y verduras": "Vegetales y frutas",
  "verduras y frutas": "Vegetales y frutas",

  seco: "Secos y granos",
  secos: "Secos y granos",
  grano: "Secos y granos",
  granos: "Secos y granos",
  "secos y granos": "Secos y granos",
  "granos y secos": "Secos y granos",
  abarrotes: "Secos y granos",
  despensa: "Secos y granos",
  cereal: "Secos y granos",
  cereales: "Secos y granos",
  harina: "Secos y granos",
  harinas: "Secos y granos",
  pan: "Secos y granos",
  panaderia: "Secos y granos",
  pasta: "Secos y granos",
  pastas: "Secos y granos",
  arroz: "Secos y granos",
  legumbre: "Secos y granos",
  legumbres: "Secos y granos",
  aceite: "Secos y granos",
  aceites: "Secos y granos",
  azucar: "Secos y granos",
  condimento: "Secos y granos",
  condimentos: "Secos y granos",
  especia: "Secos y granos",
  especias: "Secos y granos",
  "condimentos y especias": "Secos y granos",
  salsa: "Secos y granos",
  salsas: "Secos y granos",
  aderezo: "Secos y granos",
  aderezos: "Secos y granos",
  "salsas y aderezos": "Secos y granos",

  bebida: "Bebidas",
  bebidas: "Bebidas",
  refresco: "Bebidas",
  refrescos: "Bebidas",
  jugo: "Bebidas",
  jugos: "Bebidas",
  gaseosa: "Bebidas",
  gaseosas: "Bebidas",
  cafe: "Bebidas",
  te: "Bebidas",
  "cafe y te": "Bebidas",
  agua: "Bebidas",
  licor: "Bebidas",
  licores: "Bebidas",

  limpieza: "Limpieza y desechables",
  aseo: "Limpieza y desechables",
  higiene: "Limpieza y desechables",
  desechable: "Limpieza y desechables",
  desechables: "Limpieza y desechables",
  descartable: "Limpieza y desechables",
  descartables: "Limpieza y desechables",
  empaque: "Limpieza y desechables",
  empaques: "Limpieza y desechables",
  quimico: "Limpieza y desechables",
  quimicos: "Limpieza y desechables",
  "limpieza y desechables": "Limpieza y desechables",

  otro: "Otros",
  otros: "Otros",
  varias: "Otros",
  varios: "Otros",
  snack: "Otros",
  snacks: "Otros",
};

const ALIAS_POR_LARGO = Object.entries(ALIAS_GRUPO).sort((a, b) => b[0].length - a[0].length);

function claveCategoria(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " y ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function fraseEntera(clave: string, frase: string): boolean {
  const re = new RegExp(`(?:^| )${frase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?: |$)`);
  return re.test(clave);
}

/** Grupo de restaurante para una categoría de compra. No escribe en la base. */
export function grupoCategoriaStock(categoria: string | null | undefined): string {
  const clave = claveCategoria(categoria ?? "");
  if (!clave || clave === "sin categoria" || clave === "sin clasificar" || clave === "sin clasificacion") {
    return SIN_CATEGORIA_STOCK;
  }
  const exacto = ALIAS_GRUPO[clave];
  if (exacto) return exacto;
  for (const [alias, grupo] of ALIAS_POR_LARGO) {
    if (fraseEntera(clave, alias)) return grupo;
  }
  return "Otros";
}

export function categoriaVisible(categoria: string | null | undefined): string {
  return grupoCategoriaStock(categoria);
}

/**
 * USD por unidad base. Primero el costo base que ya guarda el insumo.
 * Si falta, el precio de compra repartido en el empaque. Nunca un precio supuesto.
 */
export function costoPorUnidadBase(i: {
  precioBaseUsd: number | null;
  precioCompraUsd: number | null;
  cantidadPorCompra: number;
}): number | null {
  const base = positivo(i.precioBaseUsd);
  if (base) return base;
  const compra = positivo(i.precioCompraUsd);
  if (compra && i.cantidadPorCompra > 0) return compra / i.cantidadPorCompra;
  return null;
}

/** Valor del stock físico (lo que está en cámara, reservas incluidas). */
export function valorStockUsd(stockFisico: number, costoUnitario: number | null): number | null {
  if (costoUnitario == null) return null;
  const qty = stockFisico > 0 ? stockFisico : 0;
  return qty * costoUnitario;
}

/** YYYY-MM-DD en Caracas. */
export function fechaISOEnCaracas(ahora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Caracas",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora);
}

/** Resta días de calendario a una fecha ISO, sin depender de la zona. */
export function restarDiasISO(iso: string, dias: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() - dias);
  return dt.toISOString().slice(0, 10);
}

/** Primer día de la ventana, hoy incluido. */
export function inicioVentana(hoy: string, ventana = VENTANA_CONSUMO_DIAS): string {
  const n = ventana > 0 ? ventana : 1;
  return restarDiasISO(hoy, n - 1);
}

function aplicarSwap(
  pares: Iterable<readonly [string, number]>,
  desde?: string,
  hacia?: string | null,
): [string, number][] {
  const acc = new Map<string, number>();
  for (const [id, qty] of pares) {
    if (!id || !(qty > 0) || !Number.isFinite(qty)) continue;
    acc.set(id, (acc.get(id) ?? 0) + qty);
  }
  if (!desde) return [...acc];
  const qty = acc.get(desde) ?? 0;
  if (!(qty > 0)) return [...acc];
  acc.delete(desde);
  if (hacia) acc.set(hacia, (acc.get(hacia) ?? 0) + qty);
  return [...acc];
}

/**
 * Cuánto sale de cada insumo en una venta, con la misma forma que el
 * descuento de la base: insumo directo (y no la receta, si vienen los dos),
 * luego la receta, luego la receta extra. "Sin X" quita ese insumo;
 * un swap lo mueve al reemplazo.
 */
export function salidasDeVenta(venta: VentaParaStock, expandir: ExpandirReceta): SalidaStock[] {
  const fecha = venta.fecha.slice(0, 10);
  const cant = venta.cantidad;
  if (!(cant > 0) || !Number.isFinite(cant)) return [];
  const out: SalidaStock[] = [];

  if (venta.insumoId) {
    const porUnidad = venta.insumoCantidad == null ? 1 : venta.insumoCantidad;
    const qty = porUnidad * cant;
    if (qty > 0 && Number.isFinite(qty)) {
      out.push({ insumoId: venta.insumoId, fecha, cantidad: qty });
      if (venta.swapFromInsumoId) {
        out.push({ insumoId: venta.swapFromInsumoId, fecha, cantidad: -qty });
      }
    }
    return out;
  }

  const volcar = (pares: [string, number][]) => {
    for (const [insumoId, cantidad] of pares) {
      if (cantidad > 0) out.push({ insumoId, fecha, cantidad });
    }
  };

  if (venta.recetaId) {
    volcar(aplicarSwap(expandir(venta.recetaId, cant), venta.swapFromInsumoId, venta.swapToInsumoId));
  }
  if (venta.extraRecetaId) {
    const extra = venta.extraCantidad == null ? 1 : venta.extraCantidad;
    const raciones = cant * extra;
    if (raciones > 0 && Number.isFinite(raciones)) {
      volcar(
        aplicarSwap(
          expandir(venta.extraRecetaId, raciones),
          venta.swapFromInsumoId,
          venta.swapToInsumoId,
        ),
      );
    }
  }
  return out;
}

/** Una fila del libro de stock, si es una salida de consumo. */
export function salidaDesdeMovimiento(m: {
  insumoId: string;
  fecha: string;
  tipo: string;
  cantidad: number;
}): SalidaStock | null {
  if (!TIPOS_SALIDA.has(m.tipo)) return null;
  if (!(m.cantidad < 0) || !Number.isFinite(m.cantidad)) return null;
  if (!m.insumoId) return null;
  return {
    insumoId: m.insumoId,
    fecha: m.fecha.slice(0, 10),
    cantidad: -m.cantidad,
  };
}

/** Suma salidas dentro de la ventana. Lo de afuera no cuenta. */
export function resumirConsumo(
  salidas: SalidaStock[],
  desde: string,
  hasta: string,
): Map<string, ConsumoInsumo> {
  const porInsumo = new Map<string, Map<string, number>>();
  for (const s of salidas) {
    if (!s.insumoId || !s.fecha) continue;
    const fecha = s.fecha.slice(0, 10);
    if (fecha < desde || fecha > hasta) continue;
    if (!Number.isFinite(s.cantidad) || s.cantidad === 0) continue;
    let dias = porInsumo.get(s.insumoId);
    if (!dias) {
      dias = new Map();
      porInsumo.set(s.insumoId, dias);
    }
    dias.set(fecha, (dias.get(fecha) ?? 0) + s.cantidad);
  }
  const out = new Map<string, ConsumoInsumo>();
  for (const [id, dias] of porInsumo) {
    let total = 0;
    let diasConConsumo = 0;
    for (const qty of dias.values()) {
      if (qty > EPS) {
        total += qty;
        diasConConsumo += 1;
      } else if (qty < -EPS) {
        total += qty;
      }
    }
    out.set(id, { total, diasConConsumo });
  }
  return out;
}

export function estimarDiasAgotar(input: {
  stockLibre: number;
  consumido: number;
  diasConConsumo: number;
  ventanaDias?: number;
}): EstimacionDias {
  if (!(input.stockLibre > 0)) return { estado: "agotado" };
  const ventana = input.ventanaDias ?? VENTANA_CONSUMO_DIAS;
  if (!(input.consumido > EPS) || input.diasConConsumo < MIN_DIAS_CON_CONSUMO || !(ventana > 0)) {
    return { estado: "sin_datos" };
  }
  const promedio = input.consumido / ventana;
  if (!(promedio > EPS)) return { estado: "sin_datos" };
  return {
    estado: "estimado",
    dias: input.stockLibre / promedio,
    promedioDiario: promedio,
    consumido: input.consumido,
  };
}

export function seAgotaPronto(
  est: EstimacionDias,
  umbral = DIAS_SE_AGOTA_PRONTO,
): boolean {
  return est.estado === "estimado" && est.dias <= umbral;
}

export function textoDias(est: EstimacionDias): string {
  if (est.estado === "agotado") return "Agotado";
  if (est.estado === "sin_datos") return "Sin datos de consumo";
  if (!(est.dias >= 1)) return "Menos de 1 día";
  const n = Math.round(est.dias);
  return n === 1 ? "1 día" : `${n.toLocaleString("es-VE")} días`;
}

export function lineaStock(i: InsumoStock, consumo?: ConsumoInsumo): LineaStock {
  const libre = stockLibreDe(i);
  const estado = clasificarStock(libre, i.stockMinimo);
  const costo = costoPorUnidadBase(i);
  const fisico = i.stockTotal > 0 ? i.stockTotal : 0;
  const dias = estimarDiasAgotar({
    stockLibre: libre,
    consumido: consumo?.total ?? 0,
    diasConConsumo: consumo?.diasConConsumo ?? 0,
  });
  return {
    id: i.id,
    nombre: i.nombre,
    categoria: grupoCategoriaStock(i.categoria),
    unidadBase: i.unidadBase,
    libre,
    comprometido: i.stockComprometido > 0 ? i.stockComprometido : 0,
    stockFisico: fisico,
    minimo: i.stockMinimo,
    estado,
    valorUsd: valorStockUsd(fisico, costo),
    costoUnitarioUsd: costo,
    dias,
    seAgotaPronto: seAgotaPronto(dias),
  };
}

export function armarStock(
  insumos: InsumoStock[],
  consumo: Map<string, ConsumoInsumo>,
): { lineas: LineaStock[]; resumen: ResumenStock } {
  const lineas: LineaStock[] = [];
  const resumen: ResumenStock = {
    activos: 0,
    agotados: 0,
    bajos: 0,
    sinMinimo: 0,
    seAgotanPronto: 0,
    valorUsd: 0,
    sinCosto: 0,
    conConsumo: 0,
  };
  for (const i of insumos) {
    if (!i.activo) continue;
    resumen.activos += 1;
    const linea = lineaStock(i, consumo.get(i.id));
    lineas.push(linea);
    if (linea.estado === "agotado") resumen.agotados += 1;
    else if (linea.estado === "bajo") resumen.bajos += 1;
    else if (linea.estado === "sin_minimo") resumen.sinMinimo += 1;
    if (linea.seAgotaPronto) resumen.seAgotanPronto += 1;
    if (linea.valorUsd == null) {
      if (linea.stockFisico > 0) resumen.sinCosto += 1;
    } else {
      resumen.valorUsd += linea.valorUsd;
    }
    if (linea.dias.estado === "estimado") resumen.conConsumo += 1;
  }
  return { lineas, resumen };
}

const ORDEN_GRUPO = new Map<string, number>(
  GRUPOS_CATEGORIA_STOCK.map((g, i) => [g, i]),
);
ORDEN_GRUPO.set(SIN_CATEGORIA_STOCK, GRUPOS_CATEGORIA_STOCK.length + 1);

export function categoriasDe(lineas: LineaStock[]): string[] {
  const set = new Set(lineas.map((l) => l.categoria));
  return [...set].sort((a, b) => {
    const oa = ORDEN_GRUPO.get(a) ?? GRUPOS_CATEGORIA_STOCK.length;
    const ob = ORDEN_GRUPO.get(b) ?? GRUPOS_CATEGORIA_STOCK.length;
    if (oa !== ob) return oa - ob;
    return a.localeCompare(b, "es");
  });
}

export type GrupoValorStock = {
  grupo: string;
  valorUsd: number;
  /** Parte del valor que sí tiene costo, de 0 a 100. */
  porcentaje: number;
  lineas: LineaStock[];
};

/** Dónde está la plata, por grupo. Solo grupos con valor, de mayor a menor. */
export function valorPorGrupo(lineas: LineaStock[]): GrupoValorStock[] {
  const map = new Map<string, LineaStock[]>();
  for (const l of lineas) {
    const arr = map.get(l.categoria) ?? [];
    arr.push(l);
    map.set(l.categoria, arr);
  }
  let total = 0;
  const borrador: GrupoValorStock[] = [];
  for (const [grupo, ls] of map) {
    const valorUsd = ls.reduce((s, l) => s + (l.valorUsd != null && l.valorUsd > 0 ? l.valorUsd : 0), 0);
    if (!(valorUsd > 0)) continue;
    total += valorUsd;
    borrador.push({
      grupo,
      valorUsd,
      porcentaje: 0,
      lineas: [...ls].sort(
        (a, b) => (b.valorUsd ?? -1) - (a.valorUsd ?? -1) || a.nombre.localeCompare(b.nombre, "es"),
      ),
    });
  }
  for (const g of borrador) {
    g.porcentaje = total > 0 ? (g.valorUsd / total) * 100 : 0;
  }
  borrador.sort((a, b) => b.valorUsd - a.valorUsd || a.grupo.localeCompare(b.grupo, "es"));
  return borrador;
}

/** Agotados y bajo el mínimo: lo que entra en Para pedir. */
export function losQueHayQuePedir(lineas: LineaStock[]): LineaStock[] {
  return ordenarLineas(
    lineas.filter((l) => l.estado === "agotado" || l.estado === "bajo"),
    "estado",
  );
}

export function filtrarLineas(lineas: LineaStock[], f: FiltroStock): LineaStock[] {
  const q = normalizarBusqueda(f.texto.trim());
  return lineas.filter((l) => {
    if (q && !normalizarBusqueda(l.nombre).includes(q)) return false;
    if (f.categoria === "__sin__") {
      if (l.categoria !== "Sin categoría") return false;
    } else if (f.categoria !== "todas" && l.categoria !== f.categoria) {
      return false;
    }
    if (f.estado === "pronto") return l.seAgotaPronto;
    if (f.estado !== "todos" && l.estado !== f.estado) return false;
    return true;
  });
}

const PESO_ESTADO: Record<EstadoStock, number> = {
  agotado: 0,
  bajo: 1,
  ok: 2,
  sin_minimo: 3,
};

function diasOrden(l: LineaStock): number {
  return l.dias.estado === "estimado" ? l.dias.dias : Number.POSITIVE_INFINITY;
}

function valorOrden(l: LineaStock): number {
  return l.valorUsd == null ? -1 : l.valorUsd;
}

export function ordenarLineas(lineas: LineaStock[], orden: OrdenStock): LineaStock[] {
  const copia = [...lineas];
  copia.sort((a, b) => {
    if (orden === "nombre") return a.nombre.localeCompare(b.nombre, "es");
    if (orden === "valor") {
      const d = valorOrden(b) - valorOrden(a);
      if (d !== 0) return d;
      return a.nombre.localeCompare(b.nombre, "es");
    }
    if (orden === "estado") {
      const d = PESO_ESTADO[a.estado] - PESO_ESTADO[b.estado];
      if (d !== 0) return d;
      return a.nombre.localeCompare(b.nombre, "es");
    }
    const pa = a.seAgotaPronto ? 0 : a.estado === "agotado" ? 1 : a.estado === "bajo" ? 2 : a.dias.estado === "estimado" ? 3 : 4;
    const pb = b.seAgotaPronto ? 0 : b.estado === "agotado" ? 1 : b.estado === "bajo" ? 2 : b.dias.estado === "estimado" ? 3 : 4;
    if (pa !== pb) return pa - pb;
    const dd = diasOrden(a) - diasOrden(b);
    if (dd !== 0) return dd;
    const vv = valorOrden(b) - valorOrden(a);
    if (vv !== 0) return vv;
    return a.nombre.localeCompare(b.nombre, "es");
  });
  return copia;
}

export function losDeMasValor(lineas: LineaStock[], n = 3): LineaStock[] {
  return [...lineas]
    .filter((l) => l.valorUsd != null && l.valorUsd > 0)
    .sort(
      (a, b) =>
        (b.valorUsd ?? 0) - (a.valorUsd ?? 0) || a.nombre.localeCompare(b.nombre, "es"),
    )
    .slice(0, n);
}

export function losQueSeAgotanPronto(lineas: LineaStock[]): LineaStock[] {
  return ordenarLineas(
    lineas.filter((l) => l.seAgotaPronto),
    "pronto",
  );
}

/**
 * Bolívares por dólar para valorar el stock. Usa la tasa de dólar que Hoy
 * ya muestra (BCV, promedio o la personalizada, que es Bs por dólar).
 * El euro no sirve: es Bs por euro, y el stock está en dólares.
 */
export function tasaParaValorarStock(input: {
  preferida: PreferenciaTasa | null;
  usdBs: number | null;
  paralelaBs: number | null;
  personalizada: number | null;
}): { bsPorUsd: number; origen: OrigenTasaStock } | null {
  const usd = positivo(input.usdBs);
  const paralela = positivo(input.paralelaBs);
  const propia = positivo(input.personalizada);
  const pref = input.preferida;
  if (pref === "personalizada" && propia) return { bsPorUsd: propia, origen: "personalizada" };
  if (pref === "promedio" && paralela) return { bsPorUsd: paralela, origen: "promedio" };
  if ((pref === "bcv" || pref == null || pref === "euro" || pref === "usdt") && usd) {
    return { bsPorUsd: usd, origen: "bcv" };
  }
  if (usd) return { bsPorUsd: usd, origen: "bcv" };
  if (paralela) return { bsPorUsd: paralela, origen: "promedio" };
  if (propia) return { bsPorUsd: propia, origen: "personalizada" };
  return null;
}
