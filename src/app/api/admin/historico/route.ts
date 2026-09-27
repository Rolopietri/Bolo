import { NextResponse, type NextRequest } from "next/server";
import { tokenValido, ADMIN_COOKIE } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/admin-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function autorizado(req: NextRequest): boolean {
  return tokenValido(req.cookies.get(ADMIN_COOKIE)?.value);
}

type Fila = { fecha: string | null; moneda: string | null; monto: number | null };
type FilaIng = Fila & { metodo: string | null; categoria_nombre: string | null; monto_usd: number | null };

// GET → totales por mes y por moneda de ingresos y egresos (todo el histórico),
// más el desglose de ingresos por método de pago y por categoría (en USD, para
// que sean comparables entre monedas).
// { meses: [{ mes, ingresos:{EUR,USD}, egresos }], monedas,
//   porMetodo:[{mes,clave,usd}], porCategoria:[{mes,clave,usd}] }
export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ error: "servidor no configurado" }, { status: 500 });

  // Paginar: Supabase devuelve máx. 1000 filas por request; con más de 1000
  // ingresos/egresos, un select "a secas" recortaba los totales del histórico.
  async function traerTodo<T>(tabla: string, cols: string): Promise<T[]> {
    const PAGE = 1000;
    const out: T[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await sb!.from(tabla).select(cols).range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      const rows = (data as T[]) ?? [];
      out.push(...rows);
      if (rows.length < PAGE) break;
    }
    return out;
  }
  let ingresosData: FilaIng[];
  let egresosData: Fila[];
  try {
    [ingresosData, egresosData] = await Promise.all([
      traerTodo<FilaIng>("admin_ingreso", "fecha, moneda, monto, monto_usd, metodo, categoria_nombre"),
      traerTodo<Fila>("admin_egreso", "fecha, moneda, monto"),
    ]);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }

  const meses = new Map<string, { mes: string; ingresos: Record<string, number>; egresos: Record<string, number> }>();
  const monedas = new Set<string>();
  const acumular = (filas: Fila[], lado: "ingresos" | "egresos") => {
    for (const f of filas) {
      if (!f.fecha) continue;
      const mes = f.fecha.slice(0, 7); // YYYY-MM
      const moneda = f.moneda || "EUR";
      monedas.add(moneda);
      if (!meses.has(mes)) meses.set(mes, { mes, ingresos: {}, egresos: {} });
      const registro = meses.get(mes)!;
      registro[lado][moneda] = (registro[lado][moneda] ?? 0) + (f.monto ?? 0);
    }
  };
  const ingresos = ingresosData;
  acumular(ingresos, "ingresos");
  acumular(egresosData, "egresos");

  // Desglose de ingresos por (mes, método) y (mes, categoría), en USD.
  const acumClave = (campo: "metodo" | "categoria_nombre", etiquetaVacia: string) => {
    const m = new Map<string, number>(); // key = `${mes}||${clave}`
    for (const f of ingresos) {
      if (!f.fecha) continue;
      const usd = f.monto_usd == null ? null : Number(f.monto_usd);
      if (usd == null || !isFinite(usd)) continue;
      const mes = f.fecha.slice(0, 7);
      const clave = (f[campo] || "").toString().trim() || etiquetaVacia;
      const key = `${mes}||${clave}`;
      m.set(key, (m.get(key) ?? 0) + usd);
    }
    return [...m.entries()].map(([key, usd]) => {
      const [mes, clave] = key.split("||");
      return { mes, clave, usd: Math.round(usd * 100) / 100 };
    });
  };

  const lista = [...meses.values()].sort((a, b) => a.mes.localeCompare(b.mes));
  const ORDEN = ["EUR", "USD", "Bs"];
  const monedasOrden = ORDEN.filter((m) => monedas.has(m)).concat([...monedas].filter((m) => !ORDEN.includes(m)));
  return NextResponse.json({
    meses: lista,
    monedas: monedasOrden,
    porMetodo: acumClave("metodo", "Sin método"),
    porCategoria: acumClave("categoria_nombre", "Sin categoría"),
  });
}
