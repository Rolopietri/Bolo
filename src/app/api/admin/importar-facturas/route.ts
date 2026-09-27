import { NextResponse, type NextRequest } from "next/server";
import { tokenValido, ADMIN_COOKIE } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/admin-service";
import { parseReporteFacturas, metodoCanonico, metodosDe } from "@/lib/admin/factura";
import { getTasaEurUsd } from "@/lib/admin/tasa";
import { sincronizarClientesDesdeFacturas } from "@/lib/wifi-clientes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function autorizado(req: NextRequest): boolean {
  return tokenValido(req.cookies.get(ADMIN_COOKIE)?.value);
}
const r2 = (x: number) => Math.round(x * 100) / 100;
const clave = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().replace(/\s+/g, " ");

// POST { file_base64 } → lee el "Reporte Detallado por Factura" (Excel/CSV) y
// devuelve, SIN GUARDAR: el agregado por día del reporte (Ingresos/CXC/RPP,
// tickets, ticket promedio) JUNTO con lo que ya está cargado en Administración
// para el mismo rango, para mostrar el CUADRE (qué cambiaría) antes de aplicar.
export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const raw = typeof b.file_base64 === "string" ? b.file_base64 : typeof b.pdf_base64 === "string" ? b.pdf_base64 : "";
  const b64 = raw.replace(/^data:.*;base64,/, "");
  if (!b64) return NextResponse.json({ error: "No llegó el archivo." }, { status: 400 });
  const buf = Buffer.from(b64, "base64");

  let reporte;
  try {
    reporte = parseReporteFacturas(buf);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No pude leer el archivo." }, { status: 422 });
  }
  const { desde, hasta } = reporte;

  return NextResponse.json({
    reporte: { desde, hasta, dias: reporte.dias, totales: reporte.totales, porMetodo: reporte.porMetodo, cxcDetalle: reporte.cxcDetalle, mixtas: reporte.mixtas },
  });
}

// PUT { file_base64 } → GUARDA el reporte por factura, REEMPLAZANDO su rango.
// Escribe (fechado por fecha de orden):
//   • Ingresos (contado) → admin_ingreso, fuente 'setux' (neto real + IVA real).
//   • CXC → admin_cuenta_cobrar, fuente 'factura' (bruto), por factura.
//   • RPP → admin_egreso categoría 'Cortesías', fuente 'factura' (bruto).
//   • Propina por día → admin_propina, fuente 'factura'.
//   • Tickets por día → admin_ticket_dia.
// Solo toca lo que carga este importador (fuente 'factura' / 'setux') dentro del
// rango: NO altera CXC/RPP históricos cargados por otros medios (agosto queda).
export async function PUT(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ error: "servidor no configurado" }, { status: 500 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const raw = typeof b.file_base64 === "string" ? b.file_base64 : typeof b.pdf_base64 === "string" ? b.pdf_base64 : "";
  const b64 = raw.replace(/^data:.*;base64,/, "");
  if (!b64) return NextResponse.json({ error: "No llegó el archivo." }, { status: 400 });

  let reporte;
  try {
    reporte = parseReporteFacturas(Buffer.from(b64, "base64"));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No pude leer el archivo." }, { status: 422 });
  }
  const { desde, hasta, filas, dias } = reporte;
  if (!desde || !hasta) return NextResponse.json({ error: "El reporte no tiene fechas válidas." }, { status: 422 });

  const tasa = await getTasaEurUsd(sb);
  const usd = (eur: number) => r2(eur * tasa);

  // Split manual de facturas mixtas: { [nro]: { [metodo canónico]: monto } }.
  const splits = (b.splits && typeof b.splits === "object" ? b.splits : {}) as Record<string, Record<string, number>>;
  const catDe = (m: string): "CXC" | "RPP" | "INGRESO" => (m === "CXC" ? "CXC" : m === "RPP" ? "RPP" : "INGRESO");

  // Acumuladores. Cada factura se reparte a su(s) método(s): los de contado van
  // a ingresos (neto+IVA), las CXC a cuentas por cobrar, las RPP a cortesías.
  const ingMap = new Map<string, { fecha: string; metodo: string; net: number; iva: number }>();
  const addIngreso = (fecha: string, metodo: string, net: number, iva: number) => {
    const k = `${fecha}||${metodo}`;
    const cur = ingMap.get(k) ?? { fecha, metodo, net: 0, iva: 0 };
    cur.net += net; cur.iva += iva; ingMap.set(k, cur);
  };
  // monto = BRUTO (lo que el cliente paga); iva = IVA de esa parte → neto = monto − iva.
  type CxcRow = { fecha: string; descripcion: string; deudor: string; ref: string | null; monto: number; iva: number; moneda: string; tasa: number; monto_usd: number; cobrada: boolean; fuente: string; import_hash: string };
  const cxc: CxcRow[] = [];
  const addCxc = (fecha: string, cliente: string, ref: string | null, monto: number, iva: number) => {
    cxc.push({ fecha, descripcion: ref ? `Venta a crédito ${ref}` : "Venta a crédito", deudor: cliente || "—", ref, monto: r2(monto), iva: r2(iva), moneda: "EUR", tasa, monto_usd: usd(monto), cobrada: false, fuente: "factura", import_hash: `factura|${ref ? ref.toLowerCase() : `${clave(cliente)}|${fecha}`}|${r2(monto)}` });
  };
  type RppRow = { fecha: string; concepto: string; categoria_id: null; categoria_nombre: string; clasificacion: string; proveedor_id: null; proveedor_nombre: null; monto: number; iva: number; moneda: string; tasa: number; monto_usd: number; metodo: string; factura: string | null; nota: string; fuente: string };
  const rpp: RppRow[] = [];
  const addRpp = (fecha: string, cliente: string, ref: string | null, monto: number, iva: number) => {
    rpp.push({ fecha, concepto: `Cortesías (RPP)${ref ? ` ${ref}` : ""}`, categoria_id: null, categoria_nombre: "Cortesías", clasificacion: "variable", proveedor_id: null, proveedor_nombre: null, monto: r2(monto), iva: r2(iva), moneda: "EUR", tasa, monto_usd: usd(monto), metodo: "RPP", factura: ref, nota: cliente ? `Cortesía a ${cliente}` : "Cortesía", fuente: "factura" });
  };

  for (const f of filas) {
    const ms = metodosDe(f.formaPago);
    // Referencia de la CXC = Nro. de ORDEN (no el N° de factura). Fallback al
    // número de factura solo si no hay orden.
    const ref = f.orden || f.nro || null;
    const tot = f.total || 0;
    const sp = ref ? splits[ref] : undefined;
    if (ms.length > 1 && sp && Object.keys(sp).length) {
      // Pago mixto con split especificado por el usuario: cada parte a su rubro.
      // El IVA de la factura se reparte proporcional al monto de cada parte.
      for (const [m, montoRaw] of Object.entries(sp)) {
        const a = Number(montoRaw) || 0;
        if (a <= 0.005) continue;
        const prop = tot > 0 ? a / tot : 0;
        const ivaParte = f.impuesto * prop;
        const c = catDe(m);
        if (c === "CXC") addCxc(f.fecha, f.cliente, ref, a, ivaParte);
        else if (c === "RPP") addRpp(f.fecha, f.cliente, ref, a, ivaParte);
        else addIngreso(f.fecha, m, f.ventaNeta * prop, ivaParte);
      }
    } else if (ms.length <= 1) {
      // Un solo método: directo a su rubro.
      const m = ms[0] ?? "—";
      const c = catDe(m);
      if (c === "CXC") addCxc(f.fecha, f.cliente, ref, tot, f.impuesto);
      else if (c === "RPP") addRpp(f.fecha, f.cliente, ref, tot, f.impuesto);
      else addIngreso(f.fecha, m, f.ventaNeta, f.impuesto);
    } else {
      // Mixto sin split: entra como "Mixto (…)" en ingresos (fallback).
      addIngreso(f.fecha, metodoCanonico(f.formaPago), f.ventaNeta, f.impuesto);
    }
  }

  const ingresos = Array.from(ingMap.values()).map((g) => ({
    fecha: g.fecha,
    concepto: `Ventas ${g.metodo}`.trim(),
    categoria_id: null,
    categoria_nombre: "Ventas",
    pagador: null,
    monto: r2(g.net),
    iva: r2(g.iva),
    moneda: "EUR",
    tasa,
    monto_usd: usd(g.net),
    metodo: g.metodo,
    factura: null,
    nota: "Reporte por factura",
    fuente: "setux",
  }));

  // ── Propina y tickets por día ──
  const propinas = dias.filter((d) => d.propina > 0.005).map((d) => ({
    fecha: d.fecha, monto: r2(d.propina), moneda: "EUR", fuente: "factura", nota: "Propina del reporte por factura",
  }));
  const ticketsDia = dias.map((d) => ({
    fecha: d.fecha,
    tickets: d.tickets,
    total_bruto: r2(d.ingresoBruto + d.cxcBruto + d.rppBruto),
    total_neto: r2(d.ingresoNeto + d.cxcNeto + d.rppNeto),
    propina: r2(d.propina),
    moneda: "EUR",
    fuente: "factura",
  }));

  // Importación idempotente: refresca SOLO los días que trae el reporte (y solo
  // lo que carga este importador). Reimportar el mismo reporte no duplica; los
  // días que no vienen en el archivo no se tocan.
  const fechas = [...new Set(dias.map((d) => d.fecha))];
  try {
    if (fechas.length) {
      await sb.from("admin_ingreso").delete().eq("fuente", "setux").in("fecha", fechas);
      await sb.from("admin_propina").delete().in("fuente", ["setux", "factura"]).in("fecha", fechas);
      await sb.from("admin_cuenta_cobrar").delete().eq("fuente", "factura").in("fecha", fechas);
      await sb.from("admin_egreso").delete().eq("fuente", "factura").eq("categoria_nombre", "Cortesías").in("fecha", fechas);
      await sb.from("admin_ticket_dia").delete().in("fecha", fechas);
    }

    // Inserta; si la columna `iva` aún no existe (migración pendiente), reintenta
    // sin ella para no bloquear la carga (la conciliación caería al ÷1+IVA).
    const insertResiliente = async (tabla: string, rows: Record<string, unknown>[]) => {
      const { error } = await sb.from(tabla).insert(rows);
      if (!error) return;
      if ((error as { code?: string }).code === "42703" || /iva|column/i.test(error.message)) {
        const sinIva = rows.map(({ iva, ...r }) => { void iva; return r; });
        const retry = await sb.from(tabla).insert(sinIva);
        if (retry.error) throw retry.error;
        return;
      }
      throw error;
    };
    if (ingresos.length) { const { error } = await sb.from("admin_ingreso").insert(ingresos); if (error) throw error; }
    if (cxc.length) await insertResiliente("admin_cuenta_cobrar", cxc);
    if (rpp.length) await insertResiliente("admin_egreso", rpp);
    if (propinas.length) { const { error } = await sb.from("admin_propina").insert(propinas); if (error) throw error; }
    if (ticketsDia.length) {
      const { error } = await sb.from("admin_ticket_dia").insert(ticketsDia);
      if (error) {
        const falta = (error as { code?: string }).code === "42P01" || /admin_ticket_dia|schema cache|relation/i.test(error.message);
        if (!falta) throw error; // si falta la tabla, seguimos sin bloquear el resto
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al guardar.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // ── Base de clientes: cada nombre/cédula del reporte alimenta `wifi_invitados`
  //    (la misma base del WiFi), sin duplicar. Si falla, no bloquea la carga.
  let clientes = { nuevos: 0, actualizados: 0, ignorados: 0 };
  try {
    clientes = await sincronizarClientesDesdeFacturas(sb, reporte.filas, "cafetin");
  } catch (e) {
    console.error("[clientes] sync falló:", e instanceof Error ? e.message : e);
  }

  return NextResponse.json({
    ok: true, desde, hasta, clientes,
    ingresos: ingresos.length, cxc: cxc.length, rpp: rpp.length,
    propinas: propinas.length, dias: ticketsDia.length,
    ticketPromedio: reporte.totales.ticketPromedioBruto,
    tickets: reporte.totales.tickets,
  });
}
