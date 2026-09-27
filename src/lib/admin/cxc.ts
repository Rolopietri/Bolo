// Lector del "Estado de Cuentas Clientes" (cuentas por cobrar por cliente).
// Es un PDF generado por WinDev: usa el operador de texto ' (no Tj) y dibuja
// cada glifo con su Td. Reconstruimos cada bloque BT..ET como un texto con
// posición y de ahí armamos la tabla. Solo servidor (node:zlib).
import zlib from "node:zlib";

// refAlt = referencia alterna del mismo documento en otra fuente (p. ej. el
// "Nro de factura / NE" del Excel), para migrar/limpiar cargas anteriores.
export type DocumentoCxC = { fecha: string | null; ref: string; monto: number; refAlt?: string };
export type ClienteCxC = { codigo: string; nombre: string; saldo: number; documentos: DocumentoCxC[] };
// Cortesías (RPP) del reporte detallado por forma de pago → van a egresos.
export type CortesiaCxC = { fecha: string | null; ref: string; monto: number; cliente: string | null };
export type ReporteCxC = { fecha: string | null; clientes: ClienteCxC[]; cortesias?: CortesiaCxC[] };

type Tok = { x: number; y: number; text: string };

function inflarPaginas(buf: Buffer): string[] {
  const s = buf.toString("latin1");
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  const pages: string[] = [];
  while ((m = re.exec(s))) {
    const start = m.index + m[0].length;
    const end = s.indexOf("endstream", start);
    if (end < 0) continue;
    try {
      const inflated = zlib.inflateSync(buf.subarray(start, end)).toString("latin1");
      if (inflated.includes("BT") && inflated.includes(")'")) pages.push(inflated);
    } catch {
      /* fuentes u otros streams no-flate */
    }
  }
  return pages;
}

function desescapar(raw: string): string {
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === "\\") {
      const n = raw[i + 1];
      if (n === "(" || n === ")" || n === "\\") { out += n; i++; }
      else if (n >= "0" && n <= "7") {
        let oct = n; i++;
        for (let k = 0; k < 2 && raw[i + 1] >= "0" && raw[i + 1] <= "7"; k++) oct += raw[++i];
        out += String.fromCharCode(parseInt(oct, 8));
      } else { out += n; i++; }
    } else out += c;
  }
  return out;
}

// Cada bloque BT..ET = un texto con posición (primer Td) y los glifos (x)'.
function bloques(content: string): Tok[] {
  const toks: Tok[] = [];
  const reBloque = /BT([\s\S]*?)ET/g;
  let mb: RegExpExecArray | null;
  while ((mb = reBloque.exec(content))) {
    const body = mb[1];
    const pos = body.match(/(-?\d*\.?\d+)\s+(-?\d*\.?\d+)\s+Td/);
    if (!pos) continue;
    const x = parseFloat(pos[1]);
    const y = parseFloat(pos[2]);
    const reCar = /\(((?:[^()\\]|\\.)*)\)\s*'/g;
    let mc: RegExpExecArray | null;
    let text = "";
    while ((mc = reCar.exec(body))) text += desescapar(mc[1]);
    if (text.trim()) toks.push({ x, y, text });
  }
  return toks;
}

function num(t: string | undefined): number | null {
  const s = (t ?? "").replace(/[^\d.,-]/g, "").trim();
  if (!s) return null;
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return isFinite(n) ? n : null;
}

export function parseEstadoCuentas(buf: Buffer): ReporteCxC {
  const pages = inflarPaginas(buf);
  let fecha: string | null = null;
  const clientes: ClienteCxC[] = [];
  let actual: { codigo: string; nombre: string } | null = null;
  let acc = 0; // suma de "Saldo Divisas" del cliente en curso
  let docs: DocumentoCxC[] = []; // documentos individuales del cliente en curso
  const cerrar = () => {
    if (!actual) return;
    clientes.push({ codigo: actual.codigo, nombre: actual.nombre, saldo: Math.round(acc * 100) / 100, documentos: docs });
    actual = null; acc = 0; docs = [];
  };
  // "DD/MM/YYYY" → "YYYY-MM-DD"
  const isoFecha = (s: string): string | null => {
    const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
  };

  for (const pg of pages) {
    const tk = bloques(pg);
    // Fecha del reporte: "... al DD/MM/YYYY".
    if (!fecha) {
      const todo = tk.map((t) => t.text).join(" ");
      const fm = todo.match(/al\s+(\d{2})\/(\d{2})\/(\d{4})/);
      if (fm) fecha = `${fm[3]}-${fm[2]}-${fm[1]}`;
    }
    // Filas por y, ordenadas por x.
    const filas: { y: number; items: Tok[] }[] = [];
    for (const t of tk) {
      let f = filas.find((r) => Math.abs(r.y - t.y) < 3);
      if (!f) { f = { y: t.y, items: [] }; filas.push(f); }
      f.items.push(t);
    }
    filas.forEach((f) => f.items.sort((a, b) => a.x - b.x));
    filas.sort((a, b) => b.y - a.y);

    for (const f of filas) {
      const linea = f.items.map((i) => i.text).join(" ");
      const mc = linea.match(/Cliente:\s*([A-Z0-9]+)\s*-\s*(.+?)\s+Tlf/i);
      if (mc) {
        cerrar(); // cierra el cliente anterior (por si no traía "Total Cliente")
        actual = { codigo: mc[1], nombre: mc[2].trim() };
        continue;
      }
      // El "** Total Cliente CxC Bs." es el total en bolívares (0 en divisas);
      // el saldo real por cobrar es la suma de la columna "Saldo Divisas".
      if (/Total\s+Cliente/i.test(linea)) { cerrar(); continue; }
      if (actual) {
        // Columna "Saldo Divisas" (lo que aún deben, tras abonos): x ~ 460..500.
        const sd = f.items.filter((i) => i.x > 455 && i.x < 505).map((i) => num(i.text)).filter((v): v is number => v != null);
        if (sd.length) {
          const monto = sd[sd.length - 1];
          acc += monto;
          // Cada documento con saldo != 0 es una cuenta individual.
          if (Math.abs(monto) > 0.005) {
            // fecha = primer token (x < 45); referencia = token en x ~ 70..140.
            const tFecha = f.items.find((i) => i.x < 45 && /\d{2}\/\d{2}\/\d{4}/.test(i.text));
            const tRef = f.items.find((i) => i.x >= 45 && i.x < 145 && i.text.trim());
            docs.push({
              fecha: tFecha ? isoFecha(tFecha.text) : null,
              ref: (tRef?.text ?? "").trim(),
              monto: Math.round(monto * 100) / 100,
            });
          }
        }
      }
    }
  }
  cerrar(); // cierra el último cliente si el PDF no terminó con "Total Cliente"
  return { fecha, clientes };
}
