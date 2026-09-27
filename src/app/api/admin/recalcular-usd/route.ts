import { NextResponse, type NextRequest } from "next/server";
import { tokenValido, ADMIN_COOKIE } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/admin-service";
import { getTasaEurUsd } from "@/lib/admin/tasa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function autorizado(req: NextRequest): boolean {
  return tokenValido(req.cookies.get(ADMIN_COOKIE)?.value);
}

// POST → recalcula monto_usd de TODOS los ingresos y cuentas por cobrar en
// euros usando la tasa fija del panel (1 € = tasa $). Arregla lo ya cargado.
export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ error: "servidor no configurado" }, { status: 500 });

  const tasa = await getTasaEurUsd(sb);
  let ingresos = 0;
  let cuentas = 0;

  for (const tabla of ["admin_ingreso", "admin_cuenta_cobrar"] as const) {
    const { data, error } = await sb.from(tabla).select("id, monto").eq("moneda", "EUR");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const r of data ?? []) {
      const monto = r.monto == null ? null : Number(r.monto);
      const usd = monto == null ? null : Math.round(monto * tasa * 100) / 100;
      const { error: e2 } = await sb.from(tabla).update({ monto_usd: usd, tasa }).eq("id", r.id);
      if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
      if (tabla === "admin_ingreso") ingresos++;
      else cuentas++;
    }
  }
  return NextResponse.json({ ok: true, tasa, ingresos, cuentas });
}
