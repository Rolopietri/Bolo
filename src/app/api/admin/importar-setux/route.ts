import { NextResponse, type NextRequest } from "next/server";
import { tokenValido, ADMIN_COOKIE } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/admin-service";
import { parseReporteSetux, nombreMetodo } from "@/lib/admin/setux";
import { getTasaEurUsd } from "@/lib/admin/tasa";
import { getIvaConfig, separaIva } from "@/lib/admin/iva";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function autorizado(req: NextRequest): boolean {
  return tokenValido(req.cookies.get(ADMIN_COOKIE)?.value);
}

// Clasifica cada método del reporte de INGRESOS (este importador es solo para
// dinero de contado):
//  - 'excluir': notas de crédito (no cuentan)
//  - 'detalle': CXC y RPP → se importan por su propio archivo (CXC a cuentas por
//               cobrar, RPP a egresos/cortesías); aquí se IGNORAN.
//  - 'ingreso': el resto (Pto Venta, Pago Móvil, Dólar, Zelle, Efectivo…)
type Destino = "ingreso" | "detalle" | "excluir";
function destinoDe(metodo: string): Destino {
  const k = metodo.trim().toUpperCase();
  if (k.includes("NOTA DE CREDITO") || k.includes("NOTA DE CRÉDITO")) return "excluir";
  if (k.startsWith("CXC") || k === "RPP") return "detalle";
  return "ingreso";
}

// POST { pdf_base64 } → lee el PDF y devuelve la vista previa (no guarda nada).
export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const b64 = typeof b.pdf_base64 === "string" ? b.pdf_base64.replace(/^data:.*;base64,/, "") : "";
  if (!b64) return NextResponse.json({ error: "No llegó el PDF." }, { status: 400 });
  let reporte;
  try {
    reporte = parseReporteSetux(Buffer.from(b64, "base64"));
  } catch {
    return NextResponse.json({ error: "No pude leer el PDF." }, { status: 422 });
  }
  if (!reporte.lineas.length) {
    return NextResponse.json(
      { error: "No encontré la tabla de ventas por forma de pago. ¿Es el consolidado de Setux?" },
      { status: 422 },
    );
  }
  return NextResponse.json({
    reporte: {
      ...reporte,
      lineas: reporte.lineas.map((l) => ({
        ...l,
        metodoBonito: nombreMetodo(l.metodo),
        destino: destinoDe(l.metodo),
      })),
    },
  });
}

// PUT { fecha, tasa, categoria_id, lineas:[{metodo,total,cantidad}], reemplazar }
//   → crea un ingreso por método (moneda EUR) con fuente='setux'.
export async function PUT(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ error: "servidor no configurado" }, { status: 500 });

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const fecha = typeof b.fecha === "string" ? b.fecha : null;
  if (!fecha) return NextResponse.json({ error: "falta la fecha" }, { status: 400 });
  // Todo Setux entra en euros; se convierte a USD con la tasa fija del panel.
  const tasa = await getTasaEurUsd(sb);
  const ivaCfg = await getIvaConfig(sb); // separa el IVA de las ventas facturadas
  const categoriaId = typeof b.categoria_id === "string" && b.categoria_id ? b.categoria_id : null;
  const categoriaNombre = typeof b.categoria_nombre === "string" ? b.categoria_nombre : null;
  const lineas = Array.isArray(b.lineas) ? (b.lineas as Record<string, unknown>[]) : [];
  if (lineas.length === 0) return NextResponse.json({ error: "No hay métodos que registrar." }, { status: 400 });

  const usdDe = (total: number) => Math.round(total * tasa * 100) / 100;

  // Dedupe: ¿ya hay algo de Setux para ese día (ingresos o cuentas por cobrar)?
  const [{ data: prevIng, error: e1 }, { data: prevCxc, error: e2 }] = await Promise.all([
    sb.from("admin_ingreso").select("id").eq("fuente", "setux").eq("fecha", fecha),
    sb.from("admin_cuenta_cobrar").select("id").eq("fuente", "setux").eq("fecha", fecha),
  ]);
  if (e1 || e2) return NextResponse.json({ error: (e1 || e2)!.message }, { status: 500 });
  const yaCuantos = (prevIng?.length ?? 0) + (prevCxc?.length ?? 0);
  if (yaCuantos > 0 && b.reemplazar !== true) {
    return NextResponse.json({ yaExiste: true, cuantos: yaCuantos }, { status: 409 });
  }
  if (yaCuantos > 0 && b.reemplazar === true) {
    // Solo reemplaza los ingresos de contado y la propina de ese día. NO toca
    // egresos (RPP) ni cuentas por cobrar (CXC): esos se manejan por su archivo.
    await sb.from("admin_ingreso").delete().eq("fuente", "setux").eq("fecha", fecha);
    await sb.from("admin_propina").delete().eq("fuente", "setux").eq("fecha", fecha);
  }

  // Solo ingresos de contado. CXC y RPP se ignoran (van por su propio archivo).
  const ingresos: Record<string, unknown>[] = [];
  // La propina total la decide el cliente (editable, para quitar errores).
  const propinaTotal = typeof b.propina === "number" && isFinite(b.propina) && b.propina > 0
    ? Math.round(b.propina * 100) / 100
    : 0;
  for (const l of lineas) {
    const total = typeof l.total === "number" ? l.total : Number(l.total);
    if (!isFinite(total)) continue;
    const metodo = typeof l.metodo === "string" ? l.metodo : "";
    if (destinoDe(metodo) !== "ingreso") continue; // CXC/RPP/notas → aparte
    const cantidad = typeof l.cantidad === "number" ? l.cantidad : null;
    // Separa el IVA usando el método CRUDO (Dólar sigue exento). El concepto usa
    // el nombre "bonito" (Dólar/Efectivo → "Efectivo"), sin afectar el IVA.
    const { net, iva } = separaIva(total, metodo, ivaCfg);
    ingresos.push({
      fecha,
      concepto: `Ventas ${nombreMetodo(metodo)}`.trim(),
      categoria_id: categoriaId,
      categoria_nombre: categoriaNombre,
      pagador: null,
      monto: net,
      iva,
      moneda: "EUR",
      tasa,
      monto_usd: usdDe(net),
      metodo,
      factura: null,
      nota: cantidad != null ? `${cantidad} transacciones (Xetux)` : "Xetux",
      fuente: "setux",
    });
  }

  if (ingresos.length === 0) {
    return NextResponse.json({ error: "No hay ingresos de contado que registrar." }, { status: 400 });
  }
  {
    const { error } = await sb.from("admin_ingreso").insert(ingresos);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (propinaTotal > 0) {
    await sb.from("admin_propina").insert({
      fecha,
      monto: Math.round(propinaTotal * 100) / 100,
      moneda: "EUR",
      fuente: "setux",
      nota: "Propina del reporte (no es ingreso)",
    });
  }
  return NextResponse.json({ ok: true, creados: ingresos.length, propina: Math.round(propinaTotal * 100) / 100 });
}
