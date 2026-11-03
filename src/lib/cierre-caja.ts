// Cierre de caja: cuentas puras, sin base ni navegador.
//
// La diferencia es caja − ventas, en dólares. Positivo = sobró (entró más de
// lo registrado). Negativo = faltó. Cero, al centavo, = cuadra.
// Los bolívares se pasan a dólares con la tasa BCV de ese día (Bs por $1).
// Este archivo lo corre `node` en test:cierre: sin imports y sin alias.

export type MetodoCaja =
  | "efectivo_usd"
  | "efectivo_bs"
  | "pago_movil"
  | "punto"
  | "zelle"
  | "otro";

export type MonedaCaja = "USD" | "Bs";

export type EstadoCaja = "cuadra" | "sobra" | "falta" | "sin_tasa" | "vacio";

export type LineaMonto = {
  metodo: MetodoCaja;
  moneda: MonedaCaja;
  monto: number;
  etiqueta?: string;
};

export type LineaLista = {
  metodo: MetodoCaja;
  moneda: MonedaCaja;
  /** Monto en la moneda original, ya sumado. */
  monto: number;
  /** Equivalente en USD. null si había bolívares y faltó la tasa. */
  montoUsd: number | null;
  label: string;
};

const METODOS: readonly MetodoCaja[] = [
  "efectivo_usd",
  "efectivo_bs",
  "pago_movil",
  "punto",
  "zelle",
  "otro",
];

const ETIQUETA: Record<MetodoCaja, string> = {
  efectivo_usd: "Efectivo USD",
  efectivo_bs: "Efectivo Bs",
  pago_movil: "Pago Móvil",
  punto: "Punto de venta",
  zelle: "Zelle",
  otro: "Otro",
};

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"] as const;

export function etiquetaMetodo(metodo: MetodoCaja): string {
  return ETIQUETA[metodo];
}

export function metodosCaja(): readonly MetodoCaja[] {
  return METODOS;
}

/** Moneda que corresponde al método. Otro respeta la que eligió el encargado. */
export function monedaCanon(metodo: MetodoCaja, moneda: MonedaCaja): MonedaCaja {
  if (metodo === "efectivo_usd" || metodo === "zelle") return "USD";
  if (metodo === "otro") return moneda === "USD" ? "USD" : "Bs";
  return "Bs";
}

function fmtUsd(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  const s = Math.abs(v).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return v < 0 ? `−$${s}` : `$${s}`;
}

export function redondearCentavos(n: number): number {
  return Math.round(n * 100) / 100;
}

function redondear4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function iso(fecha: string): string {
  return fecha.slice(0, 10);
}

function partes(fecha: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso(fecha).split("-").map(Number);
  return { y: y || 0, m: m || 1, d: d || 1 };
}

function sumarDias(fecha: string, dias: number): string {
  const { y, m, d } = partes(fecha);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + dias);
  return dt.toISOString().slice(0, 10);
}

/** Fechas civiles de `desde` a `hasta`, inclusive. Tope de seguridad: 400 días. */
export function diasEntre(desde: string, hasta: string): string[] {
  const fin = iso(hasta);
  const out: string[] = [];
  let cur = iso(desde);
  for (let i = 0; i < 400 && cur <= fin; i++) {
    out.push(cur);
    cur = sumarDias(cur, 1);
  }
  return out;
}

/** "martes 3 nov 2026", sin depender de la zona. */
export function etiquetaFecha(fecha: string): string {
  const { y, m, d } = partes(fecha);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const dia = DIAS[dow] ?? "";
  const mes = MESES_CORTOS[m - 1] ?? "";
  return `${dia} ${d} ${mes} ${y}`;
}

/** YYYY-MM-DD en Caracas. */
export function hoyCaracas(ahora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Caracas",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora);
}

/**
 * Lee un monto escrito a mano.
 * Vacío es 0. Acepta 120.50, 120,50, 4.500 (miles) y 4.500,50.
 * null si no es un número o es negativo.
 */
export function parseMonto(raw: string): number | null {
  const t = raw.trim().replace(/\s+/g, "");
  if (t === "") return 0;
  if (!/^[\d.,]+$/.test(t)) return null;

  const commas = t.split(",").length - 1;
  const dots = t.split(".").length - 1;
  let normal: string;

  if (commas > 0 && dots > 0) {
    if (t.lastIndexOf(",") > t.lastIndexOf(".")) {
      if (!/^\d{1,3}(\.\d{3})+(,\d{1,2})$/.test(t)) return null;
      normal = t.replace(/\./g, "").replace(",", ".");
    } else {
      if (!/^\d{1,3}(,\d{3})+(\.\d{1,2})$/.test(t)) return null;
      normal = t.replace(/,/g, "");
    }
  } else if (commas > 1) {
    if (!/^\d{1,3}(,\d{3})+$/.test(t)) return null;
    normal = t.replace(/,/g, "");
  } else if (commas === 1) {
    const [a, b] = t.split(",");
    if (b.length === 3 && a.length >= 1 && a.length <= 3) normal = a + b;
    else if (b.length <= 2) normal = `${a}.${b}`;
    else return null;
  } else if (dots > 1) {
    if (!/^\d{1,3}(\.\d{3})+$/.test(t)) return null;
    normal = t.replace(/\./g, "");
  } else if (dots === 1) {
    const [a, b] = t.split(".");
    if (b.length === 3 && a.length >= 1 && a.length <= 3) normal = a + b;
    else if (b.length <= 2) normal = `${a}.${b}`;
    else return null;
  } else {
    normal = t;
  }

  if (!/^\d+(\.\d{1,2})?$/.test(normal)) return null;
  const n = Number(normal);
  if (!Number.isFinite(n)) return null;
  return redondearCentavos(n);
}

/** Cómo mostrar un monto guardado para que el campo lo vuelva a leer igual. */
export function formatoMonto(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "";
  const r = redondearCentavos(n);
  return Number.isInteger(r) ? String(r) : r.toFixed(2);
}

export type TotalesCaja = {
  /** Total en USD. null si hay bolívares y no hay tasa. */
  usd: number | null;
  /** Total en Bs. null si hay dólares y no hay tasa para pasarlos. */
  bs: number | null;
  usdSolo: number;
  bsSolo: number;
  hayMontos: boolean;
  faltaTasa: boolean;
};

/** Totales del cierre. Los bolívares se suman y se dividen una sola vez. */
export function totalesCaja(lineas: LineaMonto[], tasaUsdBs: number | null): TotalesCaja {
  let usd = 0;
  let bs = 0;
  for (const l of lineas) {
    const monto = Number(l.monto);
    if (!Number.isFinite(monto) || monto <= 0) continue;
    const moneda = monedaCanon(l.metodo, l.moneda);
    if (moneda === "USD") usd += monto;
    else bs += monto;
  }
  const hayMontos = usd > 0 || bs > 0;
  const tasaOk = tasaUsdBs != null && tasaUsdBs > 0 && Number.isFinite(tasaUsdBs);
  const faltaTasa = bs > 0 && !tasaOk;
  return {
    usd: faltaTasa ? null : redondearCentavos(usd + (bs > 0 && tasaOk ? bs / (tasaUsdBs as number) : 0)),
    bs: usd > 0 && !tasaOk ? null : redondearCentavos(bs + (usd > 0 && tasaOk ? usd * (tasaUsdBs as number) : 0)),
    usdSolo: redondearCentavos(usd),
    bsSolo: redondearCentavos(bs),
    hayMontos,
    faltaTasa,
  };
}

export type ComparacionCaja = {
  cajaUsd: number | null;
  ventasUsd: number;
  /** Caja − ventas. Positivo = sobra. null si no se pudo pasar todo a dólares. */
  diferenciaUsd: number | null;
  estado: EstadoCaja;
  titulo: string;
  detalle: string;
};

/**
 * Compara lo cobrado con las ventas del día (ya en USD, sin mermas).
 * `hayRegistro` es false cuando el día todavía no se anotó ni se escribió nada:
 * en ese caso no decimos que "falta", aunque las ventas sean mayores a cero.
 */
export function compararCaja(input: {
  lineas: LineaMonto[];
  tasaUsdBs: number | null;
  ventasUsd: number;
  hayRegistro: boolean;
}): ComparacionCaja {
  const ventasUsd = redondearCentavos(Number.isFinite(input.ventasUsd) ? input.ventasUsd : 0);
  const tot = totalesCaja(input.lineas, input.tasaUsdBs);
  if (!input.hayRegistro && !tot.hayMontos) {
    return {
      cajaUsd: null,
      ventasUsd,
      diferenciaUsd: null,
      estado: "vacio",
      titulo: "Sin cierre",
      detalle: "Anota lo que entró por cada método para compararlo con las ventas de este día.",
    };
  }
  if (tot.faltaTasa || tot.usd == null) {
    return {
      cajaUsd: null,
      ventasUsd,
      diferenciaUsd: null,
      estado: "sin_tasa",
      titulo: "Sin tasa",
      detalle:
        "Hay bolívares y no hay tasa BCV para este día, así que no se puede pasar el cierre a dólares ni compararlo con las ventas.",
    };
  }
  const diferenciaUsd = redondearCentavos(tot.usd - ventasUsd);
  if (diferenciaUsd === 0) {
    return {
      cajaUsd: tot.usd,
      ventasUsd,
      diferenciaUsd: 0,
      estado: "cuadra",
      titulo: "Cuadra",
      detalle: "Lo cobrado coincide con las ventas de este día.",
    };
  }
  if (diferenciaUsd > 0) {
    return {
      cajaUsd: tot.usd,
      ventasUsd,
      diferenciaUsd,
      estado: "sobra",
      titulo: `Sobra ${fmtUsd(diferenciaUsd)}`,
      detalle: "Entró más de lo registrado en ventas.",
    };
  }
  return {
    cajaUsd: tot.usd,
    ventasUsd,
    diferenciaUsd,
    estado: "falta",
    titulo: `Falta ${fmtUsd(Math.abs(diferenciaUsd))}`,
    detalle: "Entró menos de lo registrado en ventas.",
  };
}

/** Líneas listas para guardar: moneda canónica, sin ceros, USD a 4 decimales. */
export function prepararLineas(
  lineas: LineaMonto[],
  tasaUsdBs: number | null,
): (LineaMonto & { montoUsd: number | null })[] {
  const vistos = new Set<MetodoCaja>();
  const out: (LineaMonto & { montoUsd: number | null })[] = [];
  for (const l of lineas) {
    if (!METODOS.includes(l.metodo) || vistos.has(l.metodo)) continue;
    const monto = redondearCentavos(Number(l.monto));
    if (!Number.isFinite(monto) || monto <= 0) continue;
    vistos.add(l.metodo);
    const moneda = monedaCanon(l.metodo, l.moneda);
    const etiqueta = l.metodo === "otro" ? (l.etiqueta ?? "").trim().slice(0, 80) : "";
    const tasaOk = tasaUsdBs != null && tasaUsdBs > 0 && Number.isFinite(tasaUsdBs);
    const montoUsd =
      moneda === "USD" ? redondear4(monto) : tasaOk ? redondear4(monto / (tasaUsdBs as number)) : null;
    out.push({
      metodo: l.metodo,
      moneda,
      monto,
      etiqueta: etiqueta || undefined,
      montoUsd,
    });
  }
  return out;
}

export type ResumenCajaSemana = {
  diasEnJuego: number;
  diasConCierre: number;
  diasSinCierre: number;
  diasSinTasa: number;
  /** Suma en USD de los días que sí se pudieron convertir. null si ninguno. */
  cobradoUsd: number | null;
  /** Suma de (caja − ventas) de esos mismos días. */
  diferenciaUsd: number | null;
  ventasDiasComparadosUsd: number;
  estado: EstadoCaja;
  titulo: string;
  detalle: string;
  porMetodo: LineaLista[];
};

type CierreResumen = {
  fecha: string;
  tasaUsdBs: number | null;
  lineas: LineaMonto[];
};

/**
 * Resumen de caja de una semana ya recortada (lunes a domingo).
 * La diferencia solo suma los días con cierre y con tasa suficiente.
 * `hoy` (YYYY-MM-DD) deja fuera del conteo "sin cierre" los días que todavía
 * no llegan. Si no se pasa, cuenta el rango completo.
 */
export function resumenCajaSemana(input: {
  desde: string;
  hasta: string;
  cierres: CierreResumen[];
  ventasUsdPorDia: Record<string, number>;
  hoy?: string;
}): ResumenCajaSemana {
  const desde = iso(input.desde);
  const hasta = iso(input.hasta);
  const dias = diasEntre(desde, hasta);
  const porFecha = new Map<string, CierreResumen>();
  for (const c of input.cierres) {
    const f = iso(c.fecha);
    if (f >= desde && f <= hasta) porFecha.set(f, c);
  }

  const hoyRef = input.hoy ? iso(input.hoy) : null;
  const tope = !hoyRef || hoyRef > hasta ? hasta : hoyRef;
  const semanaEmpezo = !hoyRef || hoyRef >= desde;

  let diasEnJuego = 0;
  let diasConCierre = 0;
  let diasSinCierre = 0;
  let diasSinTasa = 0;
  let cobrado = 0;
  let diferencia = 0;
  let ventasComparadas = 0;
  let comparables = 0;

  type Acc = { monto: number; usd: number; usdOk: boolean; etiquetas: Set<string> };
  const metodos = new Map<string, Acc>();

  function clave(metodo: MetodoCaja, moneda: MonedaCaja): string {
    return `${metodo}:${moneda}`;
  }

  for (const fecha of dias) {
    const enJuego = semanaEmpezo && fecha <= tope;
    if (enJuego) diasEnJuego += 1;
    const cierre = porFecha.get(fecha);
    if (!cierre) {
      if (enJuego) diasSinCierre += 1;
      continue;
    }
    diasConCierre += 1;
    const tasa = cierre.tasaUsdBs;
    const tot = totalesCaja(cierre.lineas, tasa);
    if (tot.faltaTasa) diasSinTasa += 1;
    else if (tot.usd != null) {
      comparables += 1;
      const ventas = redondearCentavos(
        Number.isFinite(input.ventasUsdPorDia[fecha]) ? input.ventasUsdPorDia[fecha] : 0,
      );
      cobrado = redondearCentavos(cobrado + tot.usd);
      ventasComparadas = redondearCentavos(ventasComparadas + ventas);
      diferencia = redondearCentavos(diferencia + redondearCentavos(tot.usd - ventas));
    }
    for (const l of cierre.lineas) {
      if (!METODOS.includes(l.metodo)) continue;
      const monto = redondearCentavos(Number(l.monto));
      if (!Number.isFinite(monto) || monto <= 0) continue;
      const moneda = monedaCanon(l.metodo, l.moneda);
      const k = clave(l.metodo, moneda);
      const acc = metodos.get(k) ?? { monto: 0, usd: 0, usdOk: true, etiquetas: new Set<string>() };
      acc.monto += monto;
      if (l.metodo === "otro" && l.etiqueta?.trim()) acc.etiquetas.add(l.etiqueta.trim());
      const tasaOk = tasa != null && tasa > 0 && Number.isFinite(tasa);
      if (moneda === "USD") acc.usd += monto;
      else if (tasaOk) acc.usd += monto / (tasa as number);
      else acc.usdOk = false;
      metodos.set(k, acc);
    }
  }

  const porMetodo: LineaLista[] = [];
  for (const metodo of METODOS) {
    const monedas: MonedaCaja[] = metodo === "otro" ? ["USD", "Bs"] : [monedaCanon(metodo, "Bs")];
    for (const moneda of monedas) {
      const acc = metodos.get(clave(metodo, moneda));
      if (!acc || acc.monto <= 0) continue;
      let label = ETIQUETA[metodo];
      if (metodo === "otro" && acc.etiquetas.size === 1) {
        label = `Otro · ${Array.from(acc.etiquetas)[0]}`;
      }
      porMetodo.push({
        metodo,
        moneda,
        monto: redondearCentavos(acc.monto),
        montoUsd: acc.usdOk ? redondearCentavos(acc.usd) : null,
        label,
      });
    }
  }

  const base: Omit<ResumenCajaSemana, "estado" | "titulo" | "detalle"> = {
    diasEnJuego,
    diasConCierre,
    diasSinCierre,
    diasSinTasa,
    cobradoUsd: comparables > 0 ? cobrado : null,
    diferenciaUsd: comparables > 0 ? diferencia : null,
    ventasDiasComparadosUsd: ventasComparadas,
    porMetodo,
  };

  if (diasConCierre === 0) {
    return {
      ...base,
      estado: "vacio",
      titulo: "Sin cierres",
      detalle: "Esta semana no hay cierres de caja.",
    };
  }

  const extra = extrasSemana(diasSinCierre, diasSinTasa);
  if (comparables === 0) {
    return {
      ...base,
      estado: "sin_tasa",
      titulo: "Sin tasa",
      detalle: `Hay cierres en bolívares sin tasa BCV, así que no se puede sumar la semana en dólares.${extra}`,
    };
  }

  const diff = diferencia;
  if (diff === 0) {
    return {
      ...base,
      estado: "cuadra",
      titulo: "Cuadra",
      detalle: `Lo cobrado en los días con cierre coincide con las ventas de esos días.${extra}`,
    };
  }
  if (diff > 0) {
    return {
      ...base,
      estado: "sobra",
      titulo: `Sobra ${fmtUsd(diff)}`,
      detalle: `Entró más de lo registrado en ventas, en los días con cierre.${extra}`,
    };
  }
  return {
    ...base,
    estado: "falta",
    titulo: `Falta ${fmtUsd(Math.abs(diff))}`,
    detalle: `Entró menos de lo registrado en ventas, en los días con cierre.${extra}`,
  };
}

function extrasSemana(diasSinCierre: number, diasSinTasa: number): string {
  const partesTxt: string[] = [];
  if (diasSinCierre === 1) partesTxt.push("1 día todavía sin cierre.");
  else if (diasSinCierre > 1) partesTxt.push(`${diasSinCierre} días todavía sin cierre.`);
  if (diasSinTasa === 1) partesTxt.push("1 día con bolívares no entra en la diferencia porque le falta la tasa.");
  else if (diasSinTasa > 1) {
    partesTxt.push(`${diasSinTasa} días con bolívares no entran en la diferencia porque les falta la tasa.`);
  }
  return partesTxt.length ? ` ${partesTxt.join(" ")}` : "";
}
