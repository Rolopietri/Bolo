import { NextResponse, type NextRequest } from "next/server";
import { tokenValido, ADMIN_COOKIE } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/admin-service";
import { parseEstadoCuentas } from "@/lib/admin/cxc";
import { parseReporteCxCXls } from "@/lib/admin/xls";
import { getTasaEurUsd } from "@/lib/admin/tasa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function autorizado(req: NextRequest): boolean {
  return tokenValido(req.cookies.get(ADMIN_COOKIE)?.value);
}
// clave de cliente para agrupar/deduplicar (sin acentos ni mayúsculas)
function claveCliente(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
}

// POST { pdf_base64 } → lee el archivo (PDF "Estado de Cuentas" o Excel .xls del
// reporte diario CXC de Xetux) y devuelve el detalle por cliente con sus
// documentos individuales (no guarda). Montos en euros (como las ventas).
export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const b64 = typeof b.pdf_base64 === "string" ? b.pdf_base64.replace(/^data:.*;base64,/, "") : "";
  if (!b64) return NextResponse.json({ error: "No llegó el archivo." }, { status: 400 });
  const buf = Buffer.from(b64, "base64");
  // Detecta el formato por su firma: %PDF… o el contenedor OLE2 del .xls.
  const esOle = buf.length >= 8 && buf.readUInt32LE(0) === 0xe011cfd0 && buf.readUInt32LE(4) === 0xe11ab1a1;
  const esPdf = buf.subarray(0, 5).toString("latin1") === "%PDF-";
  let reporte;
  try {
    reporte = esOle ? parseReporteCxCXls(buf) : parseEstadoCuentas(buf);
  } catch (e) {
    const msg = esOle ? "No pude leer el Excel (.xls)." : "No pude leer el PDF.";
    return NextResponse.json({ error: `${msg}${e instanceof Error ? ` (${e.message})` : ""}` }, { status: 422 });
  }
  // Solo clientes con al menos un documento (saldo != 0).
  const clientes = reporte.clientes.filter((c) => c.documentos.length > 0);
  const cortesias = (reporte.cortesias ?? []).filter((c) => Math.abs(c.monto) > 0.005);
  if (!clientes.length && !cortesias.length) {
    const pista = esOle ? "¿Es el detallado por forma de pago (CXC/RPP) de Xetux?" : esPdf ? "¿Es el Estado de Cuentas por cliente?" : "Sube el PDF de Estado de Cuentas o el Excel .xls detallado.";
    return NextResponse.json({ error: `No encontré cuentas por cobrar ni cortesías. ${pista}` }, { status: 422 });
  }
  return NextResponse.json({ reporte: { fecha: reporte.fecha, clientes, cortesias } });
}

// PUT { fecha, clientes:[{nombre, documentos:[{fecha,ref,monto}]}] }
//   → ACUMULA: inserta cada documento como una cuenta por cobrar individual,
//     deduplicando por (cliente + referencia) para no duplicar al reimportar.
//     No borra nada existente. Montos en euros, con tasa fija → equivalente USD.
export async function PUT(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ error: "servidor no configurado" }, { status: 500 });

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const fechaReporte = typeof b.fecha === "string" && b.fecha ? b.fecha : new Date().toISOString().slice(0, 10);
  const clientes = Array.isArray(b.clientes) ? (b.clientes as Record<string, unknown>[]) : [];
  const cortesias = Array.isArray(b.cortesias) ? (b.cortesias as Record<string, unknown>[]) : [];
  const tasa = await getTasaEurUsd(sb);
  const usdDe = (eur: number) => Math.round(eur * tasa * 100) / 100;

  type Fila = {
    fecha: string; descripcion: string; deudor: string; ref: string | null;
    monto: number; moneda: string; tasa: number; monto_usd: number;
    cobrada: boolean; fuente: string; import_hash: string;
  };
  const filas: Fila[] = [];
  const refsViejos: string[] = []; // referencias de control anteriores (NDE…) a migrar
  for (const c of clientes) {
    const nombre = typeof c.nombre === "string" ? c.nombre.trim() : "";
    if (!nombre) continue;
    const docs = Array.isArray(c.documentos) ? (c.documentos as Record<string, unknown>[]) : [];
    for (const d of docs) {
      const monto = typeof d.monto === "number" ? d.monto : Number(d.monto);
      if (!isFinite(monto) || Math.abs(monto) < 0.005) continue;
      const ref = typeof d.ref === "string" && d.ref.trim() ? d.ref.trim() : null;
      const refAlt = typeof d.refAlt === "string" && d.refAlt.trim() ? d.refAlt.trim() : null;
      if (refAlt) refsViejos.push(refAlt);
      const fdoc = typeof d.fecha === "string" && d.fecha ? d.fecha : fechaReporte;
      // hash de dedupe: cliente + referencia (o cliente+fecha+monto si no hay ref).
      const import_hash = ref
        ? `${claveCliente(nombre)}|${ref.toLowerCase()}`
        : `${claveCliente(nombre)}|${fdoc}|${monto}`;
      filas.push({
        fecha: fdoc,
        descripcion: ref ? `Venta a crédito ${ref}` : "Venta a crédito",
        deudor: nombre,
        ref,
        monto: Math.round(monto * 100) / 100,
        moneda: "EUR",
        tasa,
        monto_usd: usdDe(monto),
        cobrada: false,
        fuente: "estado-cuenta",
        import_hash,
      });
    }
  }
  // Cortesías (RPP) → egresos. Se registran por su fecha real.
  const egresosRpp = cortesias
    .map((c) => {
      const monto = typeof c.monto === "number" ? c.monto : Number(c.monto);
      if (!isFinite(monto) || Math.abs(monto) < 0.005) return null;
      const fdoc = typeof c.fecha === "string" && c.fecha ? c.fecha : fechaReporte;
      const ref = typeof c.ref === "string" && c.ref.trim() ? c.ref.trim() : null;
      return {
        fecha: fdoc,
        concepto: `Cortesías (RPP)${ref ? ` ${ref}` : ""}`,
        categoria_id: null,
        categoria_nombre: "Cortesías",
        clasificacion: "variable",
        proveedor_id: null,
        proveedor_nombre: null,
        monto: Math.round(monto * 100) / 100,
        moneda: "EUR",
        tasa,
        monto_usd: usdDe(monto),
        metodo: "RPP",
        factura: ref,
        nota: typeof c.cliente === "string" && c.cliente ? `Cortesía a ${c.cliente}` : "Cortesía",
        fuente: "detallado-fp",
      };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);
  const fechasRpp = [...new Set(egresosRpp.map((e) => e.fecha))];

  if (filas.length === 0 && egresosRpp.length === 0) {
    return NextResponse.json({ error: "No hay cuentas ni cortesías que registrar." }, { status: 400 });
  }

  // ── CXC → cuentas por cobrar ──
  let creados = 0, duplicadas = 0;
  if (filas.length > 0) {
    // Autolimpieza del modelo viejo (montos agregados sin referencia) + migración
    // de referencias con el control viejo (NDE…). No toca cobradas ni manuales.
    await sb.from("admin_cuenta_cobrar").delete().eq("cobrada", false).is("ref", null).in("fuente", ["estado-cuenta", "setux"]);
    if (refsViejos.length) await sb.from("admin_cuenta_cobrar").delete().eq("cobrada", false).in("ref", refsViejos);
    // Dedupe contra lo ya importado (por hash cliente+referencia).
    const hashes = filas.map((f) => f.import_hash);
    const { data: prev, error: ePrev } = await sb.from("admin_cuenta_cobrar").select("import_hash").in("import_hash", hashes);
    if (ePrev) return NextResponse.json({ error: ePrev.message }, { status: 500 });
    const existentes = new Set((prev ?? []).map((r) => r.import_hash as string));
    const vistos = new Set<string>();
    const nuevas = filas.filter((f) => { if (existentes.has(f.import_hash) || vistos.has(f.import_hash)) return false; vistos.add(f.import_hash); return true; });
    duplicadas = filas.length - nuevas.length;
    if (nuevas.length > 0) {
      const { data, error } = await sb.from("admin_cuenta_cobrar").insert(nuevas).select("id");
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      creados = data?.length ?? 0;
    }
  }

  // ── RPP → egresos (cortesías) ──
  let cortesiasGuardadas = 0;
  if (egresosRpp.length > 0) {
    // Reemplaza las cortesías ya cargadas de esas fechas (evita duplicar al reimportar).
    if (fechasRpp.length) {
      await sb.from("admin_egreso").delete().eq("fuente", "detallado-fp").eq("categoria_nombre", "Cortesías").in("fecha", fechasRpp);
    }
    const { data, error } = await sb.from("admin_egreso").insert(egresosRpp).select("id");
    if (error) {
      const falta = (error as { code?: string }).code === "42703" || /fuente|schema cache|column/i.test(error.message);
      return NextResponse.json({ error: falta ? "Falta la columna 'fuente' en admin_egreso. Corre 'supabase/admin-egreso-fuente.sql'." : error.message }, { status: 500 });
    }
    cortesiasGuardadas = data?.length ?? 0;
  }

  return NextResponse.json({ ok: true, creados, duplicadas, cortesias: cortesiasGuardadas });
}
