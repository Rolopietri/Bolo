import { NextResponse, type NextRequest } from "next/server";
import { tokenValido, ADMIN_COOKIE } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/admin-service";
import { getTasaEurUsd } from "@/lib/admin/tasa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function autorizado(req: NextRequest): boolean {
  return tokenValido(req.cookies.get(ADMIN_COOKIE)?.value);
}
const n = (v: unknown) => (v == null ? 0 : Number(v) || 0);
const norm = (s: string | null) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const r2 = (x: number) => Math.round(x * 100) / 100;

type EgRow = { id?: string; concepto?: string | null; proveedor_nombre?: string | null; categoria_id?: string | null; fecha: string | null; monto: number | null; moneda: string | null; monto_usd: number | null; categoria_nombre: string | null; clasificacion: string | null; pagada?: boolean | null };

// GET ?desde&hasta → gastos operativos (admin_egreso) en € para el P&L:
//   • fijos / variables (excluye 'Insumos' → el costo de insumos sale de Cocina
//     compras, para no doble contar; excluye 'Cortesías' → es informativo).
//   • insumosEgreso y cortesias aparte (para el guard de doble conteo / info).
//   • porCategoria y el período anterior (fijos/variables) para ▲▼.
export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ error: "servidor no configurado" }, { status: 500 });
  const url = new URL(req.url);
  const dia = /^\d{4}-\d{2}-\d{2}$/;
  const desde = url.searchParams.get("desde") ?? "";
  const hasta = url.searchParams.get("hasta") ?? "";
  if (!dia.test(desde) || !dia.test(hasta)) return NextResponse.json({ error: "rango inválido" }, { status: 400 });

  // Período anterior del mismo largo.
  const d0 = new Date(desde + "T00:00"); const d1 = new Date(hasta + "T00:00");
  const dias = Math.round((d1.getTime() - d0.getTime()) / 86400000) + 1;
  const finPrev = new Date(d0); finPrev.setDate(finPrev.getDate() - 1);
  const iniPrev = new Date(finPrev); iniPrev.setDate(iniPrev.getDate() - (dias - 1));
  const prevDesde = `${iniPrev.getFullYear()}-${String(iniPrev.getMonth() + 1).padStart(2, "0")}-${String(iniPrev.getDate()).padStart(2, "0")}`;
  const prevHasta = `${finPrev.getFullYear()}-${String(finPrev.getMonth() + 1).padStart(2, "0")}-${String(finPrev.getDate()).padStart(2, "0")}`;

  const tasa = await getTasaEurUsd(sb); // € → $ (respaldo si no hay tasa BCV)
  // Cruce BCV real por fecha (eur_bs ÷ usd_bs) para el paso €↔$. Histórico.
  const { data: tbData } = await sb
    .from("tasa_bcv")
    .select("fecha, usd_bs, eur_bs")
    .gte("fecha", prevDesde)
    .lte("fecha", hasta)
    .order("fecha", { ascending: true });
  const crossMap = new Map<string, number>();
  let ultimoCross = tasa;
  for (const t of (tbData ?? []) as { fecha: string; usd_bs: number | null; eur_bs: number | null }[]) {
    const usd = n(t.usd_bs), eur = n(t.eur_bs);
    if (eur > 0 && usd > 0) { const c = eur / usd; crossMap.set(t.fecha, c); ultimoCross = c; }
  }
  const crossDe = (fecha: string | null) => (fecha && crossMap.get(fecha)) || ultimoCross || tasa;
  // Egreso a €: los EUR tal cual; los demás con su monto_usd ÷ cruce BCV del día.
  const eurDe = (e: EgRow) => {
    if ((e.moneda ?? "EUR") === "EUR") return n(e.monto);
    const c = crossDe(e.fecha);
    return c > 0 ? n(e.monto_usd) / c : n(e.monto_usd);
  };
  const esCortesia = (e: EgRow) => norm(e.categoria_nombre).includes("cortesia");
  const esInsumo = (e: EgRow) => norm(e.categoria_nombre) === "insumos";
  const esFijo = (e: EgRow) => norm(e.clasificacion) === "fija" || norm(e.clasificacion) === "fijo";

  // Pide `pagada`; si la columna no existe aún (migración pendiente) reintenta
  // sin ella (y todo se trata como pagado, comportamiento anterior).
  const selEg = async (cols: string, d0: string, d1: string) => {
    const con = await sb.from("admin_egreso").select(`${cols}, pagada`).gte("fecha", d0).lte("fecha", d1);
    if (!con.error) return con;
    return sb.from("admin_egreso").select(cols).gte("fecha", d0).lte("fecha", d1);
  };
  const [cur, prev] = await Promise.all([
    selEg("id, concepto, proveedor_nombre, categoria_id, fecha, monto, moneda, monto_usd, categoria_nombre, clasificacion", desde, hasta),
    selEg("fecha, monto, moneda, monto_usd, categoria_nombre, clasificacion", prevDesde, prevHasta),
  ]);
  if (cur.error) return NextResponse.json({ error: cur.error.message }, { status: 500 });

  // Caja real: solo cuentan los egresos pagados (pagada != false). Los pendientes
  // (cuentas por pagar) no son gasto hasta que se pagan.
  const rows = ((cur.data ?? []) as unknown as EgRow[]).filter((e) => e.pagada !== false);
  // Egresos individuales (sin insumos ni cortesías) para el detalle por rubro.
  const items = rows.filter((e) => !esCortesia(e) && !esInsumo(e)).map((e) => ({
    id: e.id, fecha: e.fecha, concepto: e.concepto ?? null, proveedor: e.proveedor_nombre ?? null,
    categoria: e.categoria_nombre || "Otros", categoria_id: e.categoria_id ?? null,
    usd: r2((e.moneda ?? "EUR") === "EUR" ? n(e.monto) * crossDe(e.fecha) : n(e.monto_usd)),
    moneda: e.moneda ?? "EUR", monto: n(e.monto),
  })).sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""));
  let fijos = 0, variables = 0, insumosEgreso = 0, cortesias = 0;
  const porCat = new Map<string, { categoria: string; clasificacion: string; eur: number; usd: number }>();
  for (const e of rows) {
    const eur = eurDe(e);
    const usd = (e.moneda ?? "EUR") === "EUR" ? n(e.monto) * crossDe(e.fecha) : n(e.monto_usd);
    if (esCortesia(e)) { cortesias += eur; continue; }
    if (esInsumo(e)) { insumosEgreso += eur; continue; }
    if (esFijo(e)) fijos += eur; else variables += eur;
    const key = norm(e.categoria_nombre) || "otros";
    const cell = porCat.get(key) ?? { categoria: e.categoria_nombre || "Otros", clasificacion: esFijo(e) ? "fija" : "variable", eur: 0, usd: 0 };
    cell.eur += eur; cell.usd += usd; porCat.set(key, cell);
  }
  let pFijos = 0, pVariables = 0;
  for (const e of (prev.data ?? []) as unknown as EgRow[]) {
    if (e.pagada === false || esCortesia(e) || esInsumo(e)) continue;
    if (esFijo(e)) pFijos += eurDe(e); else pVariables += eurDe(e);
  }

  return NextResponse.json({
    desde, hasta,
    fijos: r2(fijos), variables: r2(variables), insumosEgreso: r2(insumosEgreso), cortesias: r2(cortesias),
    porCategoria: Array.from(porCat.values()).map((c) => ({ ...c, eur: r2(c.eur), usd: r2(c.usd) })).sort((a, b) => b.eur - a.eur),
    items,
    prev: { fijos: r2(pFijos), variables: r2(pVariables) },
  });
}
