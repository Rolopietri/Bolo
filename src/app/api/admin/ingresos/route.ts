import { NextResponse, type NextRequest } from "next/server";
import { tokenValido, ADMIN_COOKIE } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/admin-service";
import { getTasaEurUsd } from "@/lib/admin/tasa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function autorizado(req: NextRequest): boolean {
  return tokenValido(req.cookies.get(ADMIN_COOKIE)?.value);
}
function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function numero(v: unknown): number | null {
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.replace(",", "."));
    return isFinite(n) ? n : null;
  }
  return null;
}
function equivUSD(monto: number | null, moneda: string | null, tasa: number | null): number | null {
  if (monto == null) return null;
  if (moneda === "USD") return monto;
  if (moneda === "Bs") return tasa && tasa > 0 ? monto / tasa : null;
  if (moneda === "EUR") return tasa && tasa > 0 ? monto * tasa : null;
  return null;
}

function fila(e: Record<string, unknown>, tasaEurDefecto: number): Record<string, unknown> {
  const monto = numero(e.monto);
  const moneda = texto(e.moneda);
  let tasa = numero(e.tasa);
  // Los ingresos en euros usan la tasa fija del panel (1 € = 1,17 $ por defecto).
  if (moneda === "EUR" && (tasa == null || tasa <= 0)) tasa = tasaEurDefecto;
  const usd = equivUSD(monto, moneda, tasa);
  return {
    fecha: texto(e.fecha) ?? undefined,
    concepto: texto(e.concepto),
    categoria_id: texto(e.categoria_id),
    categoria_nombre: texto(e.categoria_nombre),
    pagador: texto(e.pagador),
    monto,
    moneda,
    tasa,
    monto_usd: usd == null ? null : Math.round(usd * 100) / 100,
    metodo: texto(e.metodo),
    factura: texto(e.factura),
    nota: texto(e.nota),
  };
}

// Ingresos en Bs SIN tasa → se asume la tasa BCV ($) vigente de la fecha del
// ingreso (mismo criterio que Egresos). Bs→USD = monto / usd_bs.
async function autoTasaBsBcv(sb: NonNullable<ReturnType<typeof createServiceClient>>, filas: Record<string, unknown>[]): Promise<void> {
  for (const fl of filas) {
    if (fl.moneda !== "Bs" || fl.tasa != null || fl.monto == null) continue;
    const fecha = typeof fl.fecha === "string" && fl.fecha ? fl.fecha : new Date().toISOString().slice(0, 10);
    const { data: tb } = await sb
      .from("tasa_bcv").select("usd_bs").lte("fecha", fecha)
      .order("fecha", { ascending: false }).limit(1).maybeSingle();
    const usdBs = tb ? Number((tb as { usd_bs: number | null }).usd_bs) : 0;
    if (usdBs > 0) {
      fl.tasa = usdBs;
      fl.monto_usd = Math.round((Number(fl.monto) / usdBs) * 100) / 100;
    }
  }
}

// GET ?mes=YYYY-MM → ingresos de ese mes (o todos si no se pasa mes).
export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ error: "servidor no configurado" }, { status: 500 });

  let q = sb.from("admin_ingreso").select("*").order("fecha", { ascending: false }).order("created_at", { ascending: false });
  const mes = new URL(req.url).searchParams.get("mes");
  if (mes && /^\d{4}-\d{2}$/.test(mes)) {
    const [y, m] = mes.split("-").map((x) => parseInt(x, 10));
    const desde = `${mes}-01`;
    const finMes = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const hasta = `${mes}-${String(finMes).padStart(2, "0")}`;
    q = q.gte("fecha", desde).lte("fecha", hasta);
  }
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ingresos: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ error: "servidor no configurado" }, { status: 500 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const lista = Array.isArray(b.ingresos)
    ? (b.ingresos as Record<string, unknown>[])
    : b.ingreso && typeof b.ingreso === "object"
      ? [b.ingreso as Record<string, unknown>]
      : [];
  if (lista.length === 0) return NextResponse.json({ error: "No hay ingresos que registrar." }, { status: 400 });
  const tasaEur = await getTasaEurUsd(sb);
  const filas = lista.map((e) => fila(e, tasaEur));
  await autoTasaBsBcv(sb, filas);
  const { data, error } = await sb.from("admin_ingreso").insert(filas).select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ingresos: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ error: "servidor no configurado" }, { status: 500 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = texto(b.id);
  if (!id) return NextResponse.json({ error: "falta id" }, { status: 400 });
  const tasaEur = await getTasaEurUsd(sb);
  const fl = fila(b, tasaEur);
  await autoTasaBsBcv(sb, [fl]);
  const { data, error } = await sb.from("admin_ingreso").update(fl).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ingreso: data });
}

export async function DELETE(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ error: "servidor no configurado" }, { status: 500 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "falta id" }, { status: 400 });
  // Si el ingreso es un cobro de una cuenta por cobrar, borrar el ingreso también
  // REVIERTE el cobro (borra el pago) para que el saldo del cliente vuelva a
  // reflejar la deuda; si no, quedaría pagado sin ingreso.
  const { data: ing } = await sb.from("admin_ingreso").select("fuente").eq("id", id).single();
  if (ing?.fuente === "cxc-cobro" || ing?.fuente === "cxc") {
    await sb.from("admin_cxc_pago").delete().eq("ingreso_id", id);
  }
  const { error } = await sb.from("admin_ingreso").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
