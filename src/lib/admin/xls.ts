// Lector del reporte diario de CXC de Xetux en Excel BINARIO (.xls / BIFF8).
// El .xls es un "Compound File" (OLE2) que contiene un stream "Workbook" con
// registros BIFF. Leemos el contenedor OLE2 y los registros necesarios sin
// dependencias externas, y devolvemos la MISMA forma que el lector del PDF
// (ReporteCxC), para reutilizar toda la lógica de importación.
import type { ReporteCxC, ClienteCxC, DocumentoCxC, CortesiaCxC } from "@/lib/admin/cxc";

// ── OLE2 (Compound File) ────────────────────────────────────────────
function leerOle(buf: Buffer): { entries: { name: string; type: number; startSect: number; streamSize: number }[]; readEntry: (e: { startSect: number; streamSize: number }) => Buffer } {
  if (buf.length < 512 || buf.readUInt32LE(0) !== 0xe011cfd0 || buf.readUInt32LE(4) !== 0xe11ab1a1) {
    throw new Error("no es un .xls (OLE2)");
  }
  const secSize = 1 << buf.readUInt16LE(30);
  const miniSize = 1 << buf.readUInt16LE(32);
  const dirStart = buf.readUInt32LE(48);
  const miniCutoff = buf.readUInt32LE(56);
  const miniFatStart = buf.readUInt32LE(60);
  const difStart = buf.readUInt32LE(68);
  const numDifSect = buf.readUInt32LE(72);
  const secOff = (id: number) => (id + 1) * secSize;

  // DIFAT (109 en la cabecera + sectores extra)
  const fatSectors: number[] = [];
  for (let i = 0; i < 109; i++) {
    const v = buf.readUInt32LE(76 + i * 4);
    if (v === 0xffffffff) break;
    fatSectors.push(v);
  }
  let dif = difStart;
  for (let n = 0; n < numDifSect && dif !== 0xfffffffe && dif !== 0xffffffff; n++) {
    const base = secOff(dif);
    const per = secSize / 4 - 1;
    for (let i = 0; i < per; i++) { const v = buf.readUInt32LE(base + i * 4); if (v !== 0xffffffff) fatSectors.push(v); }
    dif = buf.readUInt32LE(base + per * 4);
  }
  const fat: number[] = [];
  for (const fs of fatSectors) { const base = secOff(fs); for (let i = 0; i < secSize / 4; i++) fat.push(buf.readUInt32LE(base + i * 4)); }
  const cadena = (start: number) => { const out: number[] = []; let s = start, g = 0; while (s !== 0xfffffffe && s !== 0xffffffff && g++ < 1_000_000) { out.push(s); s = fat[s]; } return out; };
  const leerGrande = (start: number, size?: number) => {
    const parts = cadena(start).map((s) => buf.subarray(secOff(s), secOff(s) + secSize));
    const all = Buffer.concat(parts);
    return size != null ? all.subarray(0, size) : all;
  };

  // Directorio
  const dirBuf = leerGrande(dirStart);
  const entries: { name: string; type: number; startSect: number; streamSize: number }[] = [];
  for (let off = 0; off + 128 <= dirBuf.length; off += 128) {
    const nameLen = dirBuf.readUInt16LE(off + 64);
    if (nameLen <= 0) continue;
    const name = dirBuf.toString("utf16le", off, off + Math.max(0, nameLen - 2));
    entries.push({ name, type: dirBuf.readUInt8(off + 66), startSect: dirBuf.readUInt32LE(off + 116), streamSize: Number(dirBuf.readBigUInt64LE(off + 120)) });
  }
  // Mini stream (del Root Entry) + mini FAT
  const root = entries.find((e) => e.type === 5);
  const miniStream = root ? leerGrande(root.startSect, root.streamSize) : Buffer.alloc(0);
  const miniFat: number[] = [];
  for (const s of cadena(miniFatStart)) { const base = secOff(s); for (let i = 0; i < secSize / 4; i++) miniFat.push(buf.readUInt32LE(base + i * 4)); }
  const miniCadena = (start: number) => { const out: number[] = []; let s = start, g = 0; while (s !== 0xfffffffe && s !== 0xffffffff && g++ < 1_000_000) { out.push(s); s = miniFat[s]; } return out; };
  const leerMini = (start: number, size: number) => Buffer.concat(miniCadena(start).map((s) => miniStream.subarray(s * miniSize, s * miniSize + miniSize))).subarray(0, size);

  const readEntry = (e: { startSect: number; streamSize: number }) => (e.streamSize < miniCutoff ? leerMini(e.startSect, e.streamSize) : leerGrande(e.startSect, e.streamSize));
  return { entries, readEntry };
}

// ── BIFF8 ───────────────────────────────────────────────────────────
type Rec = { type: number; data: Buffer };
function biffRecords(wb: Buffer): Rec[] {
  const recs: Rec[] = [];
  let p = 0;
  while (p + 4 <= wb.length) {
    const type = wb.readUInt16LE(p);
    const len = wb.readUInt16LE(p + 2);
    recs.push({ type, data: wb.subarray(p + 4, p + 4 + len) });
    p += 4 + len;
  }
  return recs;
}

// SST (cadena de textos compartidos), con CONTINUE y textos anchos.
function parseSST(recs: Rec[]): string[] {
  const idx = recs.findIndex((r) => r.type === 0x00fc);
  if (idx < 0) return [];
  const bufs: Buffer[] = [recs[idx].data];
  for (let i = idx + 1; i < recs.length; i++) { if (recs[i].type === 0x003c) bufs.push(recs[i].data); else break; }
  let bi = 0, off = 0;
  const remain = () => bufs[bi].length - off;
  const hop = () => { bi++; off = 0; };
  const u8 = () => { if (remain() < 1) hop(); const v = bufs[bi].readUInt8(off); off += 1; return v; };
  const u16 = () => { if (remain() < 2) hop(); const v = bufs[bi].readUInt16LE(off); off += 2; return v; };
  const u32 = () => { if (remain() < 4) hop(); const v = bufs[bi].readUInt32LE(off); off += 4; return v; };

  u32(); // cstTotal
  const unique = u32();
  const out: string[] = [];
  while (out.length < unique && bi < bufs.length) {
    const cch = u16();
    let grbit = u8();
    let fHigh = grbit & 0x01;
    const fExt = grbit & 0x04, fRich = grbit & 0x08;
    const cRun = fRich ? u16() : 0;
    const cbExt = fExt ? u32() : 0;
    let str = "";
    let i = 0;
    while (i < cch) {
      if (remain() === 0) { hop(); grbit = u8(); fHigh = grbit & 0x01; } // al cruzar a CONTINUE se re-lee grbit
      str += String.fromCharCode(fHigh ? u16() : u8());
      i++;
    }
    for (let r = 0; r < cRun; r++) { u16(); u16(); }
    for (let b = 0; b < cbExt; b++) u8();
    out.push(str);
  }
  return out;
}

function rkNum(rk: number): number {
  const cents = rk & 0x01, isInt = rk & 0x02;
  let val: number;
  if (isInt) val = rk >> 2;
  else { const b = Buffer.alloc(8); b.writeUInt32LE((rk & 0xfffffffc) >>> 0, 4); val = b.readDoubleLE(0); }
  return cents ? val / 100 : val;
}

// Devuelve la primera hoja como matriz de celdas (string | number | "").
function leerHoja(recs: Rec[], sst: string[]): (string | number)[][] {
  const cells: Record<string, string | number> = {};
  let maxR = 0, maxC = 0;
  const set = (r: number, c: number, v: string | number) => { cells[`${r},${c}`] = v; if (r > maxR) maxR = r; if (c > maxC) maxC = c; };
  for (const rec of recs) {
    const d = rec.data;
    if (rec.type === 0x00fd) { const r = d.readUInt16LE(0), c = d.readUInt16LE(2), isst = d.readUInt32LE(6); set(r, c, sst[isst] ?? ""); }
    else if (rec.type === 0x0203) { set(d.readUInt16LE(0), d.readUInt16LE(2), d.readDoubleLE(6)); }
    else if (rec.type === 0x027e) { set(d.readUInt16LE(0), d.readUInt16LE(2), rkNum(d.readUInt32LE(6))); }
    else if (rec.type === 0x00bd) { const r = d.readUInt16LE(0), cF = d.readUInt16LE(2), cL = d.readUInt16LE(d.length - 2); let o = 4; for (let c = cF; c <= cL; c++) { set(r, c, rkNum(d.readUInt32LE(o + 2))); o += 6; } }
    else if (rec.type === 0x0204) { const r = d.readUInt16LE(0), c = d.readUInt16LE(2), cch = d.readUInt16LE(6), grbit = d.readUInt8(8); let str = "", o = 9; for (let i = 0; i < cch; i++) { if (grbit & 1) { str += String.fromCharCode(d.readUInt16LE(o)); o += 2; } else { str += String.fromCharCode(d.readUInt8(o)); o += 1; } } set(r, c, str); }
  }
  const grid: (string | number)[][] = [];
  for (let r = 0; r <= maxR; r++) { const row: (string | number)[] = []; for (let c = 0; c <= maxC; c++) row.push(cells[`${r},${c}`] ?? ""); grid.push(row); }
  return grid;
}

// ── Utilidades de conversión ────────────────────────────────────────
const MESES: Record<string, string> = { ene: "01", feb: "02", mar: "03", abr: "04", may: "05", jun: "06", jul: "07", ago: "08", sep: "09", set: "09", oct: "10", nov: "11", dic: "12" };
function fechaIso(s: string): string | null {
  const m = s.match(/(\d{1,2})[-/]([a-zA-Z]{3})[-/.]?[a-zA-Z]*[-/](\d{4})/);
  if (m) { const mm = MESES[m[2].toLowerCase()]; if (mm) return `${m[3]}-${mm}-${m[1].padStart(2, "0")}`; }
  const d = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return d ? `${d[3]}-${d[2]}-${d[1]}` : null;
}
function aNumero(v: string | number): number | null {
  if (typeof v === "number") return isFinite(v) ? v : null;
  const s = v.replace(/[^\d.,-]/g, "").trim();
  if (!s) return null;
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return isFinite(n) ? n : null;
}
// ── Parser principal ────────────────────────────────────────────────
// Agrupa las filas cuya "Forma de pago" es CXC por cliente, cada fila = una
// cuenta (fecha, referencia = NE-<Nro. de Orden>, monto = Total Venta).
export function parseReporteCxCXls(buf: Buffer): ReporteCxC {
  const ole = leerOle(buf);
  const wb = ole.entries.find((e) => e.type === 2 && /workbook|book/i.test(e.name));
  if (!wb) throw new Error("sin stream Workbook");
  const recs = biffRecords(ole.readEntry(wb));
  const grid = leerHoja(recs, parseSST(recs));

  // Localiza la fila de encabezados (contiene "Cliente" y "Forma de pago").
  const norm = (v: string | number) => String(v).trim().toLowerCase();
  let hRow = -1;
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r].map(norm);
    if (row.includes("cliente") && row.includes("forma de pago")) { hRow = r; break; }
  }
  if (hRow < 0) throw new Error("no encontré los encabezados (Cliente / Forma de pago)");
  const col = (nombre: string) => grid[hRow].findIndex((v) => norm(v) === nombre);
  const cCliente = col("cliente");
  const cForma = col("forma de pago");
  const cTotal = grid[hRow].findIndex((v) => norm(v) === "total venta");
  // La referencia es el "Nro. de Orden" (se muestra como NE-####), no el "Nro de factura / NE".
  const cOrden = grid[hRow].findIndex((v) => /nro\.?\s*de\s*orden/.test(norm(v)));
  const cRefAlt = grid[hRow].findIndex((v) => norm(v) === "nro de factura / ne"); // control viejo (NDE…)
  const cFecha = grid[hRow].findIndex((v) => /fecha de la factura/.test(norm(v)));

  const mapa = new Map<string, ClienteCxC>();
  const cortesias: CortesiaCxC[] = [];
  let fechaRep: string | null = null;
  for (let r = hRow + 1; r < grid.length; r++) {
    const row = grid[r];
    const forma = String(row[cForma] ?? "").trim().toUpperCase();
    if (forma !== "CXC" && forma !== "RPP") continue; // CXC (crédito) y RPP (cortesías); ignora el resto
    const monto = aNumero(row[cTotal] ?? "");
    if (monto == null || Math.abs(monto) < 0.005) continue;
    const orden = cOrden >= 0 ? String(row[cOrden] ?? "").trim() : "";
    const ref = orden ? `NE-${orden}` : "";
    const fecha = cFecha >= 0 ? fechaIso(String(row[cFecha] ?? "")) : null;
    if (fecha && !fechaRep) fechaRep = fecha;
    if (forma === "RPP") {
      cortesias.push({ fecha, ref, monto: Math.round(monto * 100) / 100, cliente: String(row[cCliente] ?? "").trim() || null });
      continue;
    }
    const nombre = String(row[cCliente] ?? "").trim();
    if (!nombre || nombre === "---") continue;
    const refAlt = cRefAlt >= 0 ? String(row[cRefAlt] ?? "").trim() : "";
    const doc: DocumentoCxC = { fecha, ref, monto: Math.round(monto * 100) / 100, ...(refAlt ? { refAlt } : {}) };
    const key = nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ");
    if (!mapa.has(key)) mapa.set(key, { codigo: "", nombre, saldo: 0, documentos: [] });
    const cli = mapa.get(key)!;
    cli.documentos.push(doc);
    cli.saldo = Math.round((cli.saldo + monto) * 100) / 100;
  }
  return { fecha: fechaRep, clientes: [...mapa.values()], cortesias };
}
