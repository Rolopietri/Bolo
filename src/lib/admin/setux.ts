// Lector del reporte "Consolidado de ventas por formas de pago" de Setux/Xetux.
// El PDF es de texto simple (un stream FlateDecode con operadores Tm/Tj), así
// que lo leemos con zlib de Node reconstruyendo la tabla por posición — sin
// dependencias externas. Solo servidor (usa node:zlib).
import zlib from "node:zlib";

export type LineaSetux = { metodo: string; cantidad: number | null; total: number; propina: number | null };
export type ReporteSetux = {
  fecha: string | null;
  desde: string | null;
  hasta: string | null;
  usuario: string | null;
  lineas: LineaSetux[];
  total: number | null;
};

type Tok = { x: number; y: number; text: string };

function inflarContenido(buf: Buffer): string {
  const s = buf.toString("latin1");
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  let out = "";
  while ((m = re.exec(s))) {
    const start = m.index + m[0].length;
    const end = s.indexOf("endstream", start);
    if (end < 0) continue;
    try {
      const inflated = zlib.inflateSync(buf.subarray(start, end)).toString("latin1");
      if (inflated.includes("Tj") || inflated.includes("TJ")) out += inflated + "\n";
    } catch {
      /* stream no comprimido con flate (p.ej. imagen): se ignora */
    }
  }
  return out;
}

function desescapar(raw: string): string {
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === "\\") {
      const n = raw[i + 1];
      if (n === "n") { out += "\n"; i++; }
      else if (n === "r") { out += "\r"; i++; }
      else if (n === "t") { out += "\t"; i++; }
      else if (n === "(" || n === ")" || n === "\\") { out += n; i++; }
      else if (n >= "0" && n <= "7") {
        let oct = n; i++;
        for (let k = 0; k < 2 && raw[i + 1] >= "0" && raw[i + 1] <= "7"; k++) oct += raw[++i];
        out += String.fromCharCode(parseInt(oct, 8));
      } else { out += n; i++; }
    } else out += c;
  }
  return out;
}

function extraerTokens(content: string): Tok[] {
  const tokens: Tok[] = [];
  let x = 0, y = 0;
  const re = /(-?\d*\.?\d+)\s+(-?\d*\.?\d+)\s+(-?\d*\.?\d+)\s+(-?\d*\.?\d+)\s+(-?\d*\.?\d+)\s+(-?\d*\.?\d+)\s+Tm|(-?\d*\.?\d+)\s+(-?\d*\.?\d+)\s+Td|\(((?:[^()\\]|\\.)*)\)\s*Tj|\[((?:[^\]\\]|\\.)*)\]\s*TJ/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    if (m[1] !== undefined) { x = parseFloat(m[5]); y = parseFloat(m[6]); }
    else if (m[7] !== undefined) { x += parseFloat(m[7]); y += parseFloat(m[8]); }
    else if (m[9] !== undefined) { tokens.push({ x, y, text: desescapar(m[9]) }); }
    else if (m[10] !== undefined) {
      const parts = m[10].match(/\(((?:[^()\\]|\\.)*)\)/g) || [];
      tokens.push({ x, y, text: parts.map((p) => desescapar(p.slice(1, -1))).join("") });
    }
  }
  return tokens;
}

function num(t: string | undefined): number | null {
  const s = (t ?? "").replace(/[^\d.,-]/g, "").trim();
  if (!s) return null;
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return isFinite(n) ? n : null;
}

export function parseReporteSetux(buf: Buffer): ReporteSetux {
  const content = inflarContenido(buf);
  const tokens = extraerTokens(content).filter((t) => t.text.trim() !== "");

  // Agrupar por fila (misma y con tolerancia) y ordenar por columna (x).
  const filas: { y: number; items: Tok[] }[] = [];
  for (const t of tokens) {
    let f = filas.find((r) => Math.abs(r.y - t.y) < 3);
    if (!f) { f = { y: t.y, items: [] }; filas.push(f); }
    f.items.push(t);
  }
  filas.forEach((f) => f.items.sort((a, b) => a.x - b.x));
  filas.sort((a, b) => b.y - a.y);

  // Fechas d/mm/aa (DESDE y HASTA).
  const fechas = tokens.map((t) => t.text.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)).filter(Boolean) as RegExpMatchArray[];
  const toIso = (mm: RegExpMatchArray) => {
    const d = mm[1], mo = mm[2];
    const y = mm[3].length === 2 ? "20" + mm[3] : mm[3];
    return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  };
  const desde = fechas.length ? toIso(fechas[0]) : null;
  const hasta = fechas.length ? toIso(fechas[fechas.length > 1 ? 1 : 0]) : null;

  // Usuario (token siguiente a "USUARIO:").
  const iu = tokens.findIndex((t) => t.text.includes("USUARIO"));
  const usuario = iu >= 0 && tokens[iu + 1] ? tokens[iu + 1].text.trim().replace(/\s+/g, " ") : null;

  // Encabezado de la tabla. Sirve para los dos reportes de Setux:
  //  - "Consolidado ... FORMAS DE PAGO" (col CANTIDAD / TOTAL VENTAS)
  //  - "Detallado por FORMA DE PAGO"    (col TRANSACCIONES / TOTAL VENTA)
  const esEncabezado = (t: string) => {
    const u = t.trim().toUpperCase();
    return u === "FORMAS DE PAGO" || u === "FORMA DE PAGO";
  };
  const header = filas.find((f) => f.items.some((i) => esEncabezado(i.text)));
  if (!header) return { fecha: desde, desde, hasta, usuario, lineas: [], total: null };

  const colX = (label: string) => {
    const it = header.items.find((i) => i.text.trim().toUpperCase().startsWith(label));
    return it ? it.x : null;
  };
  const xCantidad = colX("CANTIDAD") ?? colX("TRANSACC");
  const xTotal = colX("TOTAL VENTA") ?? colX("TOTAL PAGADO"); // "TOTAL VENTA" cubre "TOTAL VENTAS"
  const xPropina = colX("PROPINA");
  const cercano = (items: Tok[], xRef: number | null) => {
    if (xRef == null) return undefined;
    let best: Tok | undefined, bd = Infinity;
    for (const it of items) { const d = Math.abs(it.x - xRef); if (d < bd) { bd = d; best = it; } }
    return best;
  };

  const lineas: LineaSetux[] = [];
  let total: number | null = null;
  for (const f of filas) {
    if (f.y >= header.y - 1) continue; // solo filas debajo del encabezado
    const label = f.items[0];
    if (!label) continue;
    const nombre = label.text.trim();
    if (!nombre || label.x > 140) continue; // la etiqueta va pegada a la izquierda
    const totVal = num(cercano(f.items, xTotal)?.text);
    // Fila final: "TOTAL" o "TOTAL GENERAL:" → cierra la tabla.
    if (/^TOTAL($|\s|:|\sGENERAL)/i.test(nombre)) { total = totVal; break; }
    if (totVal == null || totVal === 0) continue; // ignora métodos sin ventas
    lineas.push({
      metodo: nombre,
      cantidad: num(cercano(f.items, xCantidad)?.text),
      total: totVal,
      propina: xPropina != null ? num(cercano(f.items, xPropina)?.text) : null,
    });
  }
  return { fecha: desde, desde, hasta, usuario, lineas, total };
}

// Nombres bonitos para los métodos que reporta Setux.
const NOMBRES: Record<string, string> = {
  "PAGO MOVIL": "Pago Móvil",
  "PTO DE VENTA": "Punto de Venta",
  "PTO VENTA": "Punto de Venta",
  "PUNTO DE VENTA": "Punto de Venta",
  "ZELLE": "Zelle",
  // Efectivo y Dólar (USD cash) se muestran unidos como "Efectivo". El método
  // CRUDO se conserva para el IVA (Dólar sigue exento; ver separaIva).
  "EFECTIVO": "Efectivo",
  "DOLAR": "Efectivo",
  "DÓLAR": "Efectivo",
  "DIVISAS": "Divisas",
  "CXC": "CXC (por cobrar)",
  "RPP": "RPP",
  "TDC": "Tarjeta de crédito",
  "TDD": "Tarjeta de débito",
};
export function nombreMetodo(s: string): string {
  const k = s.trim().toUpperCase();
  if (NOMBRES[k]) return NOMBRES[k];
  return k.split(/\s+/).map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(" ");
}
