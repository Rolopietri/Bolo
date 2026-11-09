import { NextResponse, type NextRequest } from "next/server";
import { tokenValido, ADMIN_COOKIE } from "@/lib/admin-auth";
import {
  esCategoriaGasto,
  gastoDesdeFila,
  usdDesdeMonto,
  type CategoriaGasto,
  type GastoFijo,
  type MonedaGasto,
} from "@/lib/gastos-fijos";
import { createServiceClient } from "@/lib/supabase/admin-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function autorizado(req: NextRequest): boolean {
  return tokenValido(req.cookies.get(ADMIN_COOKIE)?.value);
}

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function numero(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function tablaAusente(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  const msg = error.message ?? "";
  return code === "42P01" || code === "PGRST205" || /does not exist|schema cache|admin_gasto_fijo/i.test(msg);
}

async function tasaBcv(sb: NonNullable<ReturnType<typeof createServiceClient>>, fecha: string): Promise<number | null> {
  const { data } = await sb
    .from("tasa_bcv")
    .select("usd_bs")
    .lte("fecha", fecha)
    .order("fecha", { ascending: false })
    .limit(1)
    .maybeSingle();
  const usd = data ? Number((data as { usd_bs: number | null }).usd_bs) : 0;
  return usd > 0 ? usd : null;
}

type Cuerpo = {
  categoria: CategoriaGasto;
  monto: number;
  moneda: MonedaGasto;
  tasa: number | null;
  montoUsd: number;
  fecha: string;
  nota: string | null;
  recurrente: boolean;
};

async function leerCuerpo(
  sb: NonNullable<ReturnType<typeof createServiceClient>>,
  b: Record<string, unknown>,
): Promise<{ ok: true; fila: Cuerpo } | { ok: false; error: string }> {
  const categoria = texto(b.categoria) ?? "";
  if (!esCategoriaGasto(categoria)) return { ok: false, error: "Elige alquiler, nómina, servicios, gas u otro." };
  const monto = numero(b.monto);
  if (monto == null || monto < 0) return { ok: false, error: "El monto no es válido." };
  const moneda: MonedaGasto = b.moneda === "Bs" ? "Bs" : b.moneda === "USD" ? "USD" : "USD";
  if (b.moneda != null && b.moneda !== "USD" && b.moneda !== "Bs") return { ok: false, error: "La moneda es USD o Bs." };
  const fecha = texto(b.fecha) ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { ok: false, error: "La fecha no es válida." };
  const nota = texto(b.nota);
  if (nota && nota.length > 500) return { ok: false, error: "La nota es muy larga." };
  let tasa = numero(b.tasa);
  if (moneda === "Bs" && !(tasa != null && tasa > 0)) {
    tasa = await tasaBcv(sb, fecha);
  }
  if (moneda === "USD") tasa = null;
  const montoUsd = usdDesdeMonto(monto, moneda, tasa);
  if (montoUsd == null) return { ok: false, error: "No hay tasa BCV para pasar los bolívares a dólares." };
  return {
    ok: true,
    fila: {
      categoria,
      monto: Math.round(monto * 100) / 100,
      moneda,
      tasa: tasa != null && tasa > 0 ? Math.round(tasa * 10000) / 10000 : null,
      montoUsd,
      fecha,
      nota,
      recurrente: b.recurrente === true,
    },
  };
}

function aDb(f: Cuerpo) {
  return {
    categoria: f.categoria,
    monto: f.monto,
    moneda: f.moneda,
    tasa: f.tasa,
    monto_usd: f.montoUsd,
    fecha: f.fecha,
    nota: f.nota,
    recurrente: f.recurrente,
  };
}

function aJson(g: GastoFijo) {
  return {
    id: g.id,
    categoria: g.categoria,
    monto: g.monto,
    moneda: g.moneda,
    tasa: g.tasa,
    montoUsd: g.montoUsd,
    fecha: g.fecha,
    nota: g.nota,
    recurrente: g.recurrente,
  };
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ error: "servidor no configurado" }, { status: 500 });
  const { data, error } = await sb.from("admin_gasto_fijo").select("*").order("fecha", { ascending: false });
  if (error) {
    if (tablaAusente(error)) return NextResponse.json({ gastos: [], pendiente: true });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const gastos = (data ?? [])
    .map((row) => gastoDesdeFila(row as Parameters<typeof gastoDesdeFila>[0]))
    .filter((g): g is GastoFijo => g != null)
    .map(aJson);
  return NextResponse.json({ gastos, pendiente: false });
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ error: "servidor no configurado" }, { status: 500 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const origen = (b.gasto && typeof b.gasto === "object" ? b.gasto : b) as Record<string, unknown>;
  const leido = await leerCuerpo(sb, origen);
  if (!leido.ok) return NextResponse.json({ error: leido.error }, { status: 400 });
  const { data, error } = await sb.from("admin_gasto_fijo").insert(aDb(leido.fila)).select("*").single();
  if (error) {
    if (tablaAusente(error)) {
      return NextResponse.json({ error: "Falta aplicar la migración de gastos fijos." }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const gasto = gastoDesdeFila(data as Parameters<typeof gastoDesdeFila>[0]);
  return NextResponse.json({ gasto: gasto ? aJson(gasto) : null });
}

export async function PATCH(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ error: "servidor no configurado" }, { status: 500 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = texto(b.id);
  if (!id) return NextResponse.json({ error: "falta id" }, { status: 400 });
  const leido = await leerCuerpo(sb, b);
  if (!leido.ok) return NextResponse.json({ error: leido.error }, { status: 400 });
  const { data, error } = await sb.from("admin_gasto_fijo").update(aDb(leido.fila)).eq("id", id).select("*").single();
  if (error) {
    if (tablaAusente(error)) {
      return NextResponse.json({ error: "Falta aplicar la migración de gastos fijos." }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const gasto = gastoDesdeFila(data as Parameters<typeof gastoDesdeFila>[0]);
  return NextResponse.json({ gasto: gasto ? aJson(gasto) : null });
}

export async function DELETE(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ error: "servidor no configurado" }, { status: 500 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "falta id" }, { status: 400 });
  const { error } = await sb.from("admin_gasto_fijo").delete().eq("id", id);
  if (error) {
    if (tablaAusente(error)) return NextResponse.json({ ok: true });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
