// Lector del "Reporte Detallado por Factura" de Xetux (una fila = una cuenta
// cerrada). Trae método de pago, Venta Neta, Impuesto, Total, Propina y las dos
// fechas (orden = apertura, factura = cierre). Con esto salen, de un solo
// archivo: Ingresos (dinero real), CXC (crédito), RPP (cortesías) y el ticket
// promedio. Se fecha por la FECHA DE ORDEN (el cierre es inconsistente).
//
// Lee .xlsx / .xls / .csv vía SheetJS. El matching de columnas es por NOMBRE
// (tolerante a acentos, mayúsculas y espacios) para servir igual desde Numbers
// (iOS) exportado a Excel o desde Excel en Windows.
import * as XLSX from "xlsx";

export type CategoriaPago = "INGRESO" | "CXC" | "RPP";

export type FilaFactura = {
  nro: string; // N° de factura / NE
  orden: string; // Nro. Órden
  cliente: string;
  cedula: string; // RIF / CI del cliente, si el reporte lo trae
  telefono: string;
  email: string;
  fecha: string; // YYYY-MM-DD (por fecha de ORDEN)
  fechaFactura: string | null; // YYYY-MM-DD (cierre), informativo
  ventaNeta: number; // sin IVA
  impuesto: number;
  total: number; // Total Venta (neto + IVA), sin propina
  propina: number;
  formaPago: string; // crudo
  categoria: CategoriaPago;
};

export type DiaFactura = {
  fecha: string;
  ingresoNeto: number; ingresoBruto: number;
  cxcNeto: number; cxcBruto: number;
  rppNeto: number; rppBruto: number;
  propina: number;
  tickets: number; // facturas cerradas ese día (por fecha de orden)
};

// Desglose por método de pago (como el "Detallado por Forma de Pago" de Xetux).
export type MetodoAgg = { metodo: string; categoria: CategoriaPago; neto: number; iva: number; monto: number; tickets: number };
// Detalle de cuentas por cobrar por cliente (crédito del reporte).
export type CxCDetalleCliente = { cliente: string; total: number; docs: { ref: string; fecha: string; monto: number }[] };
// Factura pagada con DOS o más métodos distintos: el reporte no trae el monto
// por método, así que el usuario lo especifica antes de importar.
export type FacturaMixta = { nro: string; fecha: string; cliente: string; total: number; ventaNeta: number; impuesto: number; metodos: string[] };

export type ReporteFacturas = {
  filas: FilaFactura[];
  dias: DiaFactura[];
  porMetodo: MetodoAgg[];
  cxcDetalle: CxCDetalleCliente[];
  mixtas: FacturaMixta[];
  desde: string; hasta: string;
  totales: {
    ingresoNeto: number; ingresoBruto: number;
    cxcNeto: number; cxcBruto: number;
    rppNeto: number; rppBruto: number;
    totalNeto: number; totalBruto: number;
    propina: number;
    tickets: number;
    ticketPromedioBruto: number; ticketPromedioNeto: number;
  };
};

// "1.234,56 €" → 1234.56 ; también acepta números crudos.
function eur(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return isFinite(v) ? v : 0;
  const s = String(v).replace(/€/g, "").replace(/\s/g, "").replace(/\./g, "").replace(/,/g, ".");
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

const MESES: Record<string, string> = {
  ene: "01", feb: "02", mar: "03", abr: "04", may: "05", jun: "06",
  jul: "07", ago: "08", sep: "09", set: "09", oct: "10", nov: "11", dic: "12",
};

// Acepta "01-ago-2026 16:48:41", Date real, o serial de Excel → "YYYY-MM-DD".
function fechaISO(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date && !isNaN(v.getTime())) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  // dd-mmm-aaaa (Xetux, meses en español)
  let m = s.match(/^(\d{1,2})[-/\s]([a-zA-Záéíóú]{3,})[-/\s](\d{4})/);
  if (m) {
    const mes = MESES[m[2].slice(0, 3).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")];
    if (mes) return `${m[3]}-${mes}-${String(parseInt(m[1], 10)).padStart(2, "0")}`;
  }
  // aaaa-mm-dd o dd/mm/aaaa
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${String(+m[2]).padStart(2, "0")}-${String(+m[1]).padStart(2, "0")}`;
  return null;
}

const norm = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// Clasifica la factura por su(s) forma(s) de pago. Solo es CXC/RPP si TODAS las
// partes lo son (los pagos divididos con efectivo cuentan como ingreso real).
function clasificar(formaPago: string): CategoriaPago {
  const partes = formaPago.split("|").map((p) => norm(p)).filter(Boolean);
  if (partes.length && partes.every((p) => p === "cxc")) return "CXC";
  if (partes.length && partes.every((p) => p === "rpp")) return "RPP";
  return "INGRESO";
}

// Localiza el índice de una columna por cualquiera de sus alias (normalizados).
function col(headers: string[], ...alias: string[]): number {
  const H = headers.map(norm);
  for (const a of alias) {
    const i = H.indexOf(norm(a));
    if (i >= 0) return i;
  }
  return -1;
}

// Nombre CANÓNICO de un método de pago: unifica sinónimos, casing y acentos de
// Xetux y de los importadores viejos. Efectivo y Dólar se tratan como el MISMO
// método, bajo el nombre "Dólar". Ajusta aquí si cambian los criterios.
export function canonMetodo(raw: string): string {
  const k = (raw || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim().replace(/\s+/g, " ");
  if (!k) return "—";
  if (k.includes("PUNTO") || k === "PTO DE VENTA" || k === "PTO VENTA" || k === "PDV" || k === "POS") return "Punto de Venta";
  if (k.includes("PAGO MOVIL") || k === "PM") return "Pago Móvil";
  if (k === "ZELLE") return "Zelle";
  if (k === "TRANSFERENCIA" || k === "TRANSF" || k.includes("TRANSFEREN")) return "Transferencia";
  if (k === "DOLAR" || k === "DOLARES" || k === "USD" || k === "DIVISA" || k === "EFECTIVO" || k === "CASH" || k === "$") return "Dólar";
  if (k === "BS" || k.includes("BOLIVAR")) return "Bolívares";
  if (k === "CXC") return "CXC";
  if (k === "RPP") return "RPP";
  return raw.trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

// Métodos canónicos distintos de una forma de pago (colapsa los repetidos).
export function metodosDe(forma: string): string[] {
  return [...new Set(forma.split("|").map((p) => canonMetodo(p)).filter((p) => p !== "—"))];
}

// Método(s) canónicos de una forma de pago: colapsa los del mismo método;
// los pagos partidos entre métodos distintos quedan como "Mixto (A + B)".
export function metodoCanonico(forma: string): string {
  const partes = metodosDe(forma);
  if (partes.length === 0) return "—";
  if (partes.length === 1) return partes[0];
  return `Mixto (${partes.join(" + ")})`;
}

export function parseReporteFacturas(buf: Buffer): ReporteFacturas {
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  const hoja = wb.SheetNames[0];
  if (!hoja) throw new Error("El archivo no tiene ninguna hoja.");
  const filasCrudas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[hoja], { header: 1, raw: false, defval: "" });

  // Fila de encabezado: la primera con una columna de forma(s) de pago y otra de
  // fecha de orden. Tolerante a singular/plural y a texto extra ("Fecha de la
  // Orden", "Forma de Pago", etc.) — el matching fino de columnas va luego.
  let hIdx = -1;
  for (let i = 0; i < Math.min(filasCrudas.length, 15); i++) {
    const r = (filasCrudas[i] ?? []).map((c) => norm(c));
    const tieneForma = r.some((c) => c.includes("forma") && c.includes("pago"));
    const tieneFechaOrden = r.some((c) => c.includes("fecha") && c.includes("orden"));
    if (tieneForma && tieneFechaOrden) { hIdx = i; break; }
  }
  if (hIdx < 0) throw new Error("No reconocí el encabezado. ¿Es el 'Reporte Detallado por Factura' de Xetux?");
  const headers = (filasCrudas[hIdx] ?? []).map((c) => String(c ?? ""));

  const cNro = col(headers, "N° de Factura / NE", "N de Factura / NE", "Nro de Factura");
  const cOrden = col(headers, "Nro. Órden", "Nro. Orden", "Nro Orden", "N Orden");
  const cCliente = col(headers, "Cliente", "Nombre del Cliente", "Nombre Cliente");
  const cCedula = col(headers, "RIF", "RIF/CI", "CI/RIF", "Cédula", "Cedula", "C.I.", "CI", "Documento", "Identificación", "Identificacion", "Nro. Documento");
  const cTel = col(headers, "Teléfono", "Telefono", "Celular", "WhatsApp");
  const cEmail = col(headers, "Correo", "Email", "E-mail", "Correo Electrónico", "Correo Electronico");
  const cNeta = col(headers, "Venta Neta");
  const cImp = col(headers, "Impuesto");
  const cTotal = col(headers, "Total Venta");
  const cProp = col(headers, "Propinas", "Propina");
  const cForma = col(headers, "Formas de Pago", "Forma de Pago");
  const cFOrden = col(headers, "Fecha de Orden", "Fecha de la Orden", "Fecha de la Órden", "Fecha Orden");
  const cFFactura = col(headers, "Fecha de la factura", "Fecha de la Factura");
  if (cForma < 0 || cFOrden < 0 || cNeta < 0 || cTotal < 0) {
    throw new Error("Faltan columnas clave (Formas de Pago, Venta Neta, Total Venta o Fecha de Orden).");
  }

  const filas: FilaFactura[] = [];
  for (let i = hIdx + 1; i < filasCrudas.length; i++) {
    const r = filasCrudas[i] ?? [];
    const forma = String(r[cForma] ?? "").trim();
    const fecha = fechaISO(r[cFOrden]);
    // Fila válida = tiene fecha de orden y alguna forma de pago.
    if (!fecha || !forma) continue;
    const total = eur(r[cTotal]);
    const neta = eur(r[cNeta]);
    if (total === 0 && neta === 0) continue;
    filas.push({
      nro: String(r[cNro] ?? "").trim(),
      orden: cOrden >= 0 ? String(r[cOrden] ?? "").trim() : "",
      cliente: cCliente >= 0 ? String(r[cCliente] ?? "").trim() : "",
      cedula: cCedula >= 0 ? String(r[cCedula] ?? "").trim() : "",
      telefono: cTel >= 0 ? String(r[cTel] ?? "").trim() : "",
      email: cEmail >= 0 ? String(r[cEmail] ?? "").trim() : "",
      fecha,
      fechaFactura: cFFactura >= 0 ? fechaISO(r[cFFactura]) : null,
      ventaNeta: neta,
      impuesto: cImp >= 0 ? eur(r[cImp]) : 0,
      total,
      propina: cProp >= 0 ? eur(r[cProp]) : 0,
      formaPago: forma,
      categoria: clasificar(forma),
    });
  }
  if (!filas.length) throw new Error("No encontré facturas en el archivo.");

  // Agregado por día (fecha de orden).
  const mapa = new Map<string, DiaFactura>();
  for (const f of filas) {
    const d = mapa.get(f.fecha) ?? { fecha: f.fecha, ingresoNeto: 0, ingresoBruto: 0, cxcNeto: 0, cxcBruto: 0, rppNeto: 0, rppBruto: 0, propina: 0, tickets: 0 };
    d.tickets += 1;
    d.propina += f.propina;
    if (f.categoria === "CXC") { d.cxcNeto += f.ventaNeta; d.cxcBruto += f.total; }
    else if (f.categoria === "RPP") { d.rppNeto += f.ventaNeta; d.rppBruto += f.total; }
    else { d.ingresoNeto += f.ventaNeta; d.ingresoBruto += f.total; }
    mapa.set(f.fecha, d);
  }
  const dias = Array.from(mapa.values()).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const r2 = (x: number) => Math.round(x * 100) / 100;
  for (const d of dias) {
    d.ingresoNeto = r2(d.ingresoNeto); d.ingresoBruto = r2(d.ingresoBruto);
    d.cxcNeto = r2(d.cxcNeto); d.cxcBruto = r2(d.cxcBruto);
    d.rppNeto = r2(d.rppNeto); d.rppBruto = r2(d.rppBruto);
    d.propina = r2(d.propina);
  }

  const sum = (sel: (f: FilaFactura) => number, cat?: CategoriaPago) =>
    filas.filter((f) => !cat || f.categoria === cat).reduce((s, f) => s + sel(f), 0);
  const tickets = filas.length;
  const totalBruto = sum((f) => f.total);
  const totalNeto = sum((f) => f.ventaNeta);
  const totales = {
    ingresoNeto: r2(sum((f) => f.ventaNeta, "INGRESO")),
    ingresoBruto: r2(sum((f) => f.total, "INGRESO")),
    cxcNeto: r2(sum((f) => f.ventaNeta, "CXC")),
    cxcBruto: r2(sum((f) => f.total, "CXC")),
    rppNeto: r2(sum((f) => f.ventaNeta, "RPP")),
    rppBruto: r2(sum((f) => f.total, "RPP")),
    totalNeto: r2(totalNeto),
    totalBruto: r2(totalBruto),
    propina: r2(sum((f) => f.propina)),
    tickets,
    ticketPromedioBruto: r2(tickets > 0 ? totalBruto / tickets : 0),
    ticketPromedioNeto: r2(tickets > 0 ? totalNeto / tickets : 0),
  };

  // Desglose por método de pago (bruto = Total Venta), con nombres CANÓNICOS.
  const metodoDe = metodoCanonico;
  const mm = new Map<string, MetodoAgg>();
  for (const f of filas) {
    const metodo = metodoDe(f.formaPago);
    const cur = mm.get(metodo) ?? { metodo, categoria: f.categoria, neto: 0, iva: 0, monto: 0, tickets: 0 };
    cur.neto += f.ventaNeta; cur.iva += f.impuesto; cur.monto += f.total; cur.tickets += 1; mm.set(metodo, cur);
  }
  const porMetodo = Array.from(mm.values()).map((m) => ({ ...m, neto: r2(m.neto), iva: r2(m.iva), monto: r2(m.monto) })).sort((a, b) => b.monto - a.monto);

  // Detalle de cuentas por cobrar por cliente (crédito, bruto).
  const cm = new Map<string, CxCDetalleCliente>();
  for (const f of filas) {
    if (f.categoria !== "CXC") continue;
    const cliente = f.cliente || "—";
    const cur = cm.get(cliente) ?? { cliente, total: 0, docs: [] };
    cur.total += f.total;
    cur.docs.push({ ref: f.orden || f.nro || "", fecha: f.fecha, monto: r2(f.total) });
    cm.set(cliente, cur);
  }
  const cxcDetalle = Array.from(cm.values()).map((c) => ({ ...c, total: r2(c.total) })).sort((a, b) => b.total - a.total);

  // Facturas con pago mixto (2+ métodos distintos) — para especificar el split.
  const mixtas: FacturaMixta[] = filas
    .map((f) => ({ f, ms: metodosDe(f.formaPago) }))
    .filter((x) => x.ms.length > 1)
    .map(({ f, ms }) => ({ nro: f.orden || f.nro, fecha: f.fecha, cliente: f.cliente, total: r2(f.total), ventaNeta: r2(f.ventaNeta), impuesto: r2(f.impuesto), metodos: ms }));

  return { filas, dias, porMetodo, cxcDetalle, mixtas, desde: dias[0]?.fecha ?? "", hasta: dias[dias.length - 1]?.fecha ?? "", totales };
}
