import { NextResponse, type NextRequest } from "next/server";
import { tokenValido, ADMIN_COOKIE } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/admin-service";
import { getIvaConfig } from "@/lib/admin/iva";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function autorizado(req: NextRequest): boolean {
  return tokenValido(req.cookies.get(ADMIN_COOKIE)?.value);
}
const n = (v: unknown) => (v == null ? 0 : Number(v) || 0);
const norm = (s: string | null) => (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

// GET ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD (o ?mes=YYYY-MM) → componentes (en euros)
// para conciliar las "Ventas en Cocina" con Administración:
//   Cocina (neto, incl. CXC+RPP) − CXC − RPP = ventas POS de contado ≈ Setux neto
export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ error: "servidor no configurado" }, { status: 500 });
  const url = new URL(req.url);
  const dia = /^\d{4}-\d{2}-\d{2}$/;
  let desde = url.searchParams.get("desde") ?? "";
  let hasta = url.searchParams.get("hasta") ?? "";
  const mes = url.searchParams.get("mes");
  if ((!dia.test(desde) || !dia.test(hasta)) && mes && /^\d{4}-\d{2}$/.test(mes)) {
    const [y, m] = mes.split("-").map((x) => parseInt(x, 10));
    desde = `${mes}-01`;
    hasta = `${mes}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
  }
  if (!dia.test(desde) || !dia.test(hasta)) return NextResponse.json({ error: "rango inválido" }, { status: 400 });

  // La columna `iva` en egreso/cxc puede no existir aún (migración pendiente):
  // se pide, y si falla por columna inexistente se reintenta sin ella.
  type Fila = { monto?: unknown; moneda?: unknown; categoria_nombre?: unknown; iva?: unknown };
  const selConIva = async (tabla: string, cols: string): Promise<Fila[]> => {
    const con = await sb.from(tabla).select(`${cols}, iva`).gte("fecha", desde).lte("fecha", hasta);
    if (!con.error) return (con.data ?? []) as Fila[];
    const sin = await sb.from(tabla).select(cols).gte("fecha", desde).lte("fecha", hasta);
    return (sin.data ?? []) as Fila[];
  };
  const [ingR, egrRows, cxcRows, tkR] = await Promise.all([
    sb.from("admin_ingreso").select("monto, iva, moneda, fuente").gte("fecha", desde).lte("fecha", hasta),
    selConIva("admin_egreso", "monto, moneda, categoria_nombre"),
    selConIva("admin_cuenta_cobrar", "monto, moneda"),
    sb.from("admin_ticket_dia").select("tickets").gte("fecha", desde).lte("fecha", hasta),
  ]);
  if (ingR.error) return NextResponse.json({ error: ingR.error.message }, { status: 500 });

  // Tickets (facturas) del período, sumados por día. Si la tabla aún no existe
  // (migración pendiente), se ignora y quedan en 0.
  const tickets = (tkR.error ? [] : (tkR.data ?? [])).reduce((s, t) => s + (Number((t as { tickets?: unknown }).tickets) || 0), 0);

  const ingresos = ingR.data ?? [];
  // Ventas POS del mes (Setux), netas y en euros — sin cobros ni manuales.
  const setuxNeto = ingresos.filter((e) => e.fuente === "setux" && (e.moneda ?? "EUR") === "EUR").reduce((s, e) => s + n(e.monto), 0);
  const ivaSetux = ingresos.filter((e) => e.fuente === "setux").reduce((s, e) => s + n(e.iva), 0);
  // Cobros de CXC del mes (cobranzas, NO ventas del mes) — se muestran aparte.
  const cobrosEur = ingresos.filter((e) => e.fuente === "cxc-cobro" && (e.moneda ?? "EUR") === "EUR").reduce((s, e) => s + n(e.monto), 0);
  // Otros ingresos en euros que no son Setux ni cobros (manuales en €).
  const otrosEur = ingresos.filter((e) => e.fuente !== "setux" && e.fuente !== "cxc-cobro" && (e.moneda ?? "EUR") === "EUR").reduce((s, e) => s + n(e.monto), 0);

  // CXC y RPP se guardan en BRUTO (con IVA, como el "Total Venta" del reporte =
  // lo que el cliente paga). Para conciliar con Cocina —que va en NETO— se pasan
  // a neto: si el registro trae su IVA, neto = monto − iva (EXACTO, respeta las
  // facturas con 0 IVA como alquileres); si no (dato viejo), se aproxima ÷1+IVA.
  const ivaCfg = await getIvaConfig(sb);
  const factor = 1 + (ivaCfg.ivaPct ?? 16) / 100;
  const netoDe = (monto: number, iva: unknown) =>
    iva == null ? (factor > 0 ? monto / factor : monto) : monto - n(iva);

  const egrEur = egrRows.filter((e) => (e.moneda ?? "EUR") === "EUR");
  const cortesias = egrEur.filter((e) => norm(typeof e.categoria_nombre === "string" ? e.categoria_nombre : null).includes("cortesia"));
  // Cortesías (RPP) del mes: egreso categoría "Cortesías", en euros.
  const rpp = cortesias.reduce((s, e) => s + n(e.monto), 0);
  const rppNeto = cortesias.reduce((s, e) => s + netoDe(n(e.monto), e.iva), 0);
  // Ventas a crédito (CXC) del mes: cuentas por cobrar con fecha en el mes.
  const cxcEur = cxcRows.filter((c) => (c.moneda ?? "EUR") === "EUR");
  const cxc = cxcEur.reduce((s, c) => s + n(c.monto), 0);
  const cxcNeto = cxcEur.reduce((s, c) => s + netoDe(n(c.monto), c.iva), 0);

  const r2 = (x: number) => Math.round(x * 100) / 100;
  return NextResponse.json({
    desde, hasta,
    setuxNeto: r2(setuxNeto),
    ivaSetux: r2(ivaSetux),
    cxc: r2(cxc),
    rpp: r2(rpp),
    cxcNeto: r2(cxcNeto),
    rppNeto: r2(rppNeto),
    cobrosEur: r2(cobrosEur),
    otrosEur: r2(otrosEur),
    tickets,
  });
}
