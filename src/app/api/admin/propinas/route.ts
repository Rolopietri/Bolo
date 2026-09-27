import { NextResponse, type NextRequest } from "next/server";
import { tokenValido, ADMIN_COOKIE } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/admin-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function autorizado(req: NextRequest): boolean {
  return tokenValido(req.cookies.get(ADMIN_COOKIE)?.value);
}

// GET ?mes=YYYY-MM → propinas de ese mes (o todas). La propina NO es ingreso.
export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ error: "servidor no configurado" }, { status: 500 });
  let q = sb.from("admin_propina").select("*").order("fecha", { ascending: false });
  const mes = new URL(req.url).searchParams.get("mes");
  if (mes && /^\d{4}-\d{2}$/.test(mes)) {
    const [y, m] = mes.split("-").map((x) => parseInt(x, 10));
    const finMes = new Date(Date.UTC(y, m, 0)).getUTCDate();
    q = q.gte("fecha", `${mes}-01`).lte("fecha", `${mes}-${String(finMes).padStart(2, "0")}`);
  }
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ propinas: data ?? [] });
}

// POST → registrar una propina MANUAL (p.ej. un cliente que deja propina al
// pagar una cuenta por cobrar). No es ingreso; se paga al personal.
export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ error: "servidor no configurado" }, { status: 500 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const monto = typeof b.monto === "number" ? b.monto : Number(String(b.monto ?? "").replace(",", "."));
  if (!isFinite(monto) || monto <= 0) {
    return NextResponse.json({ error: "El monto debe ser mayor a 0." }, { status: 400 });
  }
  // tipo "entrega" = pago de propina al personal → SALE del bolsillo de propinas
  // (monto negativo). No es egreso ni toca ingresos: solo baja el saldo por
  // entregar. "recibida" (por defecto) = propina que entró (monto positivo).
  const esEntrega = b.tipo === "entrega";
  const fecha = typeof b.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.fecha) ? b.fecha : undefined;
  const moneda = b.moneda === "USD" || b.moneda === "Bs" ? (b.moneda as string) : "EUR";
  const nota = typeof b.nota === "string" && b.nota.trim() ? b.nota.trim() : null;
  const signo = esEntrega ? -1 : 1;
  const { data, error } = await sb
    .from("admin_propina")
    .insert({ fecha, monto: signo * Math.round(monto * 100) / 100, moneda, fuente: esEntrega ? "entrega" : "manual", nota })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ propina: data });
}

export async function DELETE(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ error: "servidor no configurado" }, { status: 500 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "falta id" }, { status: 400 });
  const { error } = await sb.from("admin_propina").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
