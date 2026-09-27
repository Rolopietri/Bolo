import { NextResponse, type NextRequest } from "next/server";
import { tokenValido, ADMIN_COOKIE } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/admin-service";
import { getTasaEurUsd } from "@/lib/admin/tasa";
import { getIvaConfig, separaIva } from "@/lib/admin/iva";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function autorizado(req: NextRequest): boolean {
  return tokenValido(req.cookies.get(ADMIN_COOKIE)?.value);
}

// POST → separa el IVA de los ingresos de Setux ya cargados (donde iva es NULL).
// Deja el neto en monto y el IVA en iva. Se corre una sola vez (el guard iva
// IS NULL evita volver a dividir).
export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ error: "servidor no configurado" }, { status: 500 });

  const [tasa, ivaCfg] = await Promise.all([getTasaEurUsd(sb), getIvaConfig(sb)]);
  const { data, error } = await sb
    .from("admin_ingreso")
    .select("id, monto, metodo")
    .eq("fuente", "setux")
    .is("iva", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let ajustados = 0;
  for (const r of data ?? []) {
    const gross = r.monto == null ? null : Number(r.monto);
    if (gross == null) continue;
    const { net, iva } = separaIva(gross, r.metodo ?? "", ivaCfg);
    const monto_usd = Math.round(net * tasa * 100) / 100;
    const { error: e2 } = await sb.from("admin_ingreso").update({ monto: net, iva, monto_usd }).eq("id", r.id);
    if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
    ajustados++;
  }
  return NextResponse.json({ ok: true, ajustados, ivaPct: ivaCfg.ivaPct });
}
