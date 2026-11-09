import { NextResponse, type NextRequest } from "next/server";
import { esCategoriaCortesia, esCategoriaInsumos, usdDeCompra, usdDeEgreso, type TasaDia } from "@/lib/admin/cuadre";
import { tokenValido, ADMIN_COOKIE } from "@/lib/admin-auth";
import { egresoCubiertoPorFijo, gastoDesdeFila, rangoMes, resumirGastos, type GastoFijo } from "@/lib/gastos-fijos";
import { createServiceClient } from "@/lib/supabase/admin-service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
  clasificacion?: string | null;
  pagada?: boolean | null;
};
type FilaVenta = {
  fecha: string | null;
  total_usd: number | null;
  precio_unitario_usd: number | null;
  cantidad: number | null;
  receta_nombre: string | null;
};
type FilaCompra = { fecha: string | null; precio_total_usd: number | null; flete_usd: number | null };
type Tasa = { fecha: string; usd_bs: number | null; eur_bs: number | null };

const n = (v: unknown) => (v == null ? 0 : Number(v) || 0);
const r2 = (x: number) => Math.round(x * 100) / 100;

// GET → histórico mensual en USD.
// Ingresos: solo public.ventas (Cocina), sin mermas. No se suma admin_ingreso.
// Egresos: gastos pagados (sin Insumos ni Cortesías, para no contarlos dos
// veces) más las compras de Cocina con su flete. Misma regla que el Estado.
export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  // Ventas, compras y tasas las lee la sesión (el mismo acceso que Semana).
  // Los egresos de Administración siguen por service role: esa tabla no tiene
  // política de lectura para el usuario. Si la clave no está, el histórico
  // igual muestra ventas y compras.
  const sb = await createSupabaseServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const sbEgresos = createServiceClient();

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
  let egresos: FilaEgr[] = [];
  let compras: FilaCompra[];
  let tasas: Tasa[];
  let gastosFijos: GastoFijo[] = [];
  let gastosFijosPendiente = false;
  try {
    [ventas, compras, tasas] = await Promise.all([
      paginar<FilaVenta>((from, to) =>
        sb.from("ventas").select("fecha, total_usd, precio_unitario_usd, cantidad, receta_nombre").eq("es_merma", false).range(from, to) as PromiseLike<{ data: FilaVenta[] | null; error: { message: string } | null }>,
      ),
      paginar<FilaCompra>((from, to) =>
        sb.from("compras").select("fecha, precio_total_usd, flete_usd").range(from, to) as PromiseLike<{ data: FilaCompra[] | null; error: { message: string } | null }>,
      ),
      paginar<Tasa>((from, to) =>
        sb.from("tasa_bcv").select("fecha, usd_bs, eur_bs").range(from, to) as PromiseLike<{ data: Tasa[] | null; error: { message: string } | null }>,
      ),
    ]);
    if (sbEgresos) {
      egresos = await paginar<FilaEgr>((from, to) =>
        sbEgresos.from("admin_egreso").select("fecha, moneda, monto, monto_usd, categoria_nombre, clasificacion, pagada").range(from, to) as PromiseLike<{ data: FilaEgr[] | null; error: { message: string } | null }>,
      );
      const gf = await sbEgresos.from("admin_gasto_fijo").select("id, categoria, monto, moneda, tasa, monto_usd, fecha, nota, recurrente");
      if (gf.error) {
        const code = (gf.error as { code?: string }).code ?? "";
        const msg = gf.error.message ?? "";
        if (code === "42P01" || code === "PGRST205" || /does not exist|schema cache|admin_gasto_fijo/i.test(msg)) {
          gastosFijosPendiente = true;
        } else {
          throw new Error(gf.error.message);
        }
      } else {
        gastosFijos = (gf.data ?? [])
          .map((row) => gastoDesdeFila(row as Parameters<typeof gastoDesdeFila>[0]))
          .filter((g): g is GastoFijo => g != null);
      }
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }

  const tasasDia: TasaDia[] = tasas.map((t) => ({
    fecha: t.fecha,
    usdBs: n(t.usd_bs),
    eurBs: t.eur_bs == null ? null : n(t.eur_bs),
  }));
  let tasaUsdBs: number | null = null;
  for (const t of [...tasasDia].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    if (t.usdBs > 0) tasaUsdBs = t.usdBs;
  }

  const meses = new Map<string, { mes: string; ingresos: Record<string, number>; egresos: Record<string, number> }>();
  const celda = (mes: string) => {
    if (!meses.has(mes)) meses.set(mes, { mes, ingresos: { USD: 0 }, egresos: { USD: 0 } });
    return meses.get(mes)!;
  };

  const porPlato = new Map<string, number>();
  for (const v of ventas) {
    if (!v.fecha) continue;
    const mes = v.fecha.slice(0, 7);
    const usd =
      v.total_usd != null && Number.isFinite(Number(v.total_usd))
        ? n(v.total_usd)
        : n(v.precio_unitario_usd) * n(v.cantidad);
    const reg = celda(mes);
    reg.ingresos.USD = (reg.ingresos.USD ?? 0) + usd;
    const plato = (v.receta_nombre || "").trim() || "Sin plato";
    const key = `${mes}||${plato}`;
    porPlato.set(key, (porPlato.get(key) ?? 0) + usd);
  }
  for (const e of egresos) {
    if (!e.fecha || e.pagada === false) continue;
    if (esCategoriaInsumos(e.categoria_nombre) || esCategoriaCortesia(e.categoria_nombre)) continue;
    if (egresoCubiertoPorFijo({ fecha: e.fecha, categoria: e.categoria_nombre, clasificacion: e.clasificacion }, gastosFijos)) continue;
    const mes = e.fecha.slice(0, 7);
    const reg = celda(mes);
    reg.egresos.USD = (reg.egresos.USD ?? 0) + usdDeEgreso(e, tasasDia);
  }
  const gastosFijosPorMes: { mes: string; clave: string; usd: number }[] = [];
  if (gastosFijos.length > 0) {
    const hoyMes = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Caracas",
      year: "numeric",
      month: "2-digit",
    }).format(new Date()).slice(0, 7);
    const inicio = gastosFijos.map((g) => g.fecha.slice(0, 7)).sort()[0] ?? hoyMes;
    let tope = hoyMes;
    for (const m of meses.keys()) if (m > tope) tope = m;
    let y = Number(inicio.slice(0, 4));
    let mo = Number(inicio.slice(5, 7));
    let guard = 0;
    while (`${y}-${String(mo).padStart(2, "0")}` <= tope && guard < 36) {
      const mes = `${y}-${String(mo).padStart(2, "0")}`;
      const rango = rangoMes(mes);
      const resumen = resumirGastos(gastosFijos, rango.desde, rango.hasta);
      if (resumen.totalUsd > 0.004) {
        const reg = celda(mes);
        reg.egresos.USD = (reg.egresos.USD ?? 0) + resumen.totalUsd;
        for (const c of resumen.porCategoria) {
          gastosFijosPorMes.push({ mes, clave: c.label, usd: c.usd });
        }
      }
      mo += 1;
      if (mo > 12) {
        mo = 1;
        y += 1;
      }
      guard += 1;
    }
  }
  for (const c of compras) {
    if (!c.fecha) continue;
    const mes = c.fecha.slice(0, 7);
    const reg = celda(mes);
    reg.egresos.USD = (reg.egresos.USD ?? 0) + usdDeCompra({ precioTotalUsd: n(c.precio_total_usd), fleteUsd: n(c.flete_usd) });
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
    porCategoria: gastosFijosPorMes,
    gastosFijosPendiente,
    porPlato: [...porPlato.entries()].map(([key, usd]) => {
      const [mes, clave] = key.split("||");
      return { mes, clave, usd: r2(usd) };
    }),
    tasaUsdBs,
  });
}
