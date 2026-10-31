import { NextResponse, type NextRequest } from "next/server";
import { tokenValido, ADMIN_COOKIE } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/admin-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function autorizado(req: NextRequest): boolean {
  return tokenValido(req.cookies.get(ADMIN_COOKIE)?.value);
}

type FilaEgr = {
  fecha: string | null;
  moneda: string | null;
  monto: number | null;
  monto_usd: number | null;
  categoria_nombre: string | null;
};
type FilaVenta = { fecha: string | null; total_usd: number | null; receta_nombre: string | null };
type Tasa = { fecha: string; usd_bs: number | null; eur_bs: number | null };

const n = (v: unknown) => (v == null ? 0 : Number(v) || 0);
const r2 = (x: number) => Math.round(x * 100) / 100;

// GET → histórico mensual en USD.
// Ingresos: solo public.ventas (Cocina), sin mermas. No se suma admin_ingreso.
// Egresos: admin_egreso pasado a USD (monto_usd, o el cruce BCV si falta).
export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ error: "servidor no configurado" }, { status: 500 });

  async function paginar<T>(
    leer: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  ): Promise<T[]> {
    const PAGE = 1000;
    const out: T[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await leer(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      const rows = data ?? [];
      out.push(...rows);
      if (rows.length < PAGE) break;
    }
    return out;
  }

  let ventas: FilaVenta[];
  let egresos: FilaEgr[];
  let tasas: Tasa[];
  try {
    [ventas, egresos, tasas] = await Promise.all([
      paginar<FilaVenta>((from, to) =>
        sb.from("ventas").select("fecha, total_usd, receta_nombre").eq("es_merma", false).range(from, to) as PromiseLike<{ data: FilaVenta[] | null; error: { message: string } | null }>,
      ),
      paginar<FilaEgr>((from, to) =>
        sb.from("admin_egreso").select("fecha, moneda, monto, monto_usd, categoria_nombre").range(from, to) as PromiseLike<{ data: FilaEgr[] | null; error: { message: string } | null }>,
      ),
      paginar<Tasa>((from, to) =>
        sb.from("tasa_bcv").select("fecha, usd_bs, eur_bs").range(from, to) as PromiseLike<{ data: Tasa[] | null; error: { message: string } | null }>,
      ),
    ]);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }

  const crossMap = new Map<string, number>();
  let ultimoCross = 1;
  let tasaUsdBs: number | null = null;
  const tasasOrd = [...tasas].sort((a, b) => a.fecha.localeCompare(b.fecha));
  for (const t of tasasOrd) {
    const usd = n(t.usd_bs);
    const eur = n(t.eur_bs);
    if (usd > 0) tasaUsdBs = usd;
    if (eur > 0 && usd > 0) {
      crossMap.set(t.fecha, eur / usd);
      ultimoCross = eur / usd;
    }
  }
  const crossDe = (fecha: string | null) => (fecha && crossMap.get(fecha)) || ultimoCross;

  const usdEgreso = (e: FilaEgr): number => {
    if (e.monto_usd != null && Number.isFinite(Number(e.monto_usd))) return n(e.monto_usd);
    const mon = e.moneda || "USD";
    if (mon === "USD") return n(e.monto);
    if (mon === "EUR") return n(e.monto) * crossDe(e.fecha);
    return 0;
  };

  const meses = new Map<string, { mes: string; ingresos: Record<string, number>; egresos: Record<string, number> }>();
  const celda = (mes: string) => {
    if (!meses.has(mes)) meses.set(mes, { mes, ingresos: { USD: 0 }, egresos: { USD: 0 } });
    return meses.get(mes)!;
  };

  const porPlato = new Map<string, number>();
  for (const v of ventas) {
    if (!v.fecha) continue;
    const mes = v.fecha.slice(0, 7);
    const usd = n(v.total_usd);
    const reg = celda(mes);
    reg.ingresos.USD = (reg.ingresos.USD ?? 0) + usd;
    const plato = (v.receta_nombre || "").trim() || "Sin plato";
    const key = `${mes}||${plato}`;
    porPlato.set(key, (porPlato.get(key) ?? 0) + usd);
  }
  for (const e of egresos) {
    if (!e.fecha) continue;
    const mes = e.fecha.slice(0, 7);
    const reg = celda(mes);
    reg.egresos.USD = (reg.egresos.USD ?? 0) + usdEgreso(e);
  }

  const lista = [...meses.values()]
    .map((m) => ({
      ...m,
      ingresos: { USD: r2(m.ingresos.USD ?? 0) },
      egresos: { USD: r2(m.egresos.USD ?? 0) },
    }))
    .sort((a, b) => a.mes.localeCompare(b.mes));

  return NextResponse.json({
    meses: lista,
    monedas: ["USD"],
    // El cierre por método de pago no vive en ventas; llega en un paso posterior.
    porMetodo: [],
    porCategoria: [],
    porPlato: [...porPlato.entries()].map(([key, usd]) => {
      const [mes, clave] = key.split("||");
      return { mes, clave, usd: r2(usd) };
    }),
    tasaUsdBs,
  });
}
