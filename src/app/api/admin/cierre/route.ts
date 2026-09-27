import { NextResponse, type NextRequest } from "next/server";
import { tokenValido, ADMIN_COOKIE } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/admin-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function autorizado(req: NextRequest): boolean {
  return tokenValido(req.cookies.get(ADMIN_COOKIE)?.value);
}

// Lista los cierres guardados (para la historia y las comparaciones).
export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ error: "servidor no configurado" }, { status: 500 });
  const { data, error } = await sb.from("admin_cierre_mensual").select("*").order("mes", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cierres: data });
}

// Cierra (o recalcula) un mes: computa totales desde el libro y los congela.
export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ error: "servidor no configurado" }, { status: 500 });

  const b = (await req.json().catch(() => ({}))) as { mes?: unknown };
  const mes = typeof b.mes === "string" && /^\d{4}-\d{2}$/.test(b.mes) ? b.mes : null;
  if (!mes) return NextResponse.json({ error: "mes inválido (YYYY-MM)" }, { status: 400 });

  const { data: movs, error } = await sb
    .from("admin_movimiento")
    .select("tipo, monto_usd, categoria")
    .eq("mes", mes);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let ingresos = 0, gastos = 0;
  const desglose: { ingresos: Record<string, number>; gastos: Record<string, number> } = { ingresos: {}, gastos: {} };
  for (const m of (movs as { tipo: string; monto_usd: number | string; categoria: string }[])) {
    const monto = Number(m.monto_usd) || 0;
    if (m.tipo === "ingreso") {
      ingresos += monto;
      desglose.ingresos[m.categoria] = (desglose.ingresos[m.categoria] ?? 0) + monto;
    } else {
      gastos += monto;
      desglose.gastos[m.categoria] = (desglose.gastos[m.categoria] ?? 0) + monto;
    }
  }

  const fila = { mes, total_ingresos: ingresos, total_gastos: gastos, resultado: ingresos - gastos, desglose };
  const { error: e2 } = await sb.from("admin_cierre_mensual").upsert(fila, { onConflict: "mes" });
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
  return NextResponse.json({ cierre: fila });
}
