import { NextResponse, type NextRequest } from "next/server";
import { tokenValido, ADMIN_COOKIE } from "@/lib/admin-auth";
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
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.replace(",", "."));
    return isFinite(n) ? n : null;
  }
  return null;
}

function limpiarLinea(l: Record<string, unknown>, orden: number): Record<string, unknown> {
  return {
    orden,
    tipo: texto(l.tipo) === "adicional" ? "adicional" : "proveedor",
    proveedor_id: texto(l.proveedor_id),
    proveedor_nombre: texto(l.proveedor_nombre),
    datos_registrados: l.datos_registrados === true,
    concepto: texto(l.concepto),
    monto: numero(l.monto),
    moneda: texto(l.moneda),
    metodo: texto(l.metodo),
    tasa: numero(l.tasa),
    tasa_tipo: texto(l.tasa_tipo),
    factura: texto(l.factura),
    nota: texto(l.nota),
  };
}

// GET /api/admin/solicitudes           → lista (cabeceras, más reciente primero)
// GET /api/admin/solicitudes?id=UUID    → una solicitud con sus líneas
export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ error: "servidor no configurado" }, { status: 500 });

  const id = new URL(req.url).searchParams.get("id");
  if (id) {
    const { data: cab, error: e1 } = await sb.from("admin_solicitud").select("*").eq("id", id).single();
    if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });
    const { data: lineas, error: e2 } = await sb
      .from("admin_solicitud_linea")
      .select("*")
      .eq("solicitud_id", id)
      .order("orden", { ascending: true });
    if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
    return NextResponse.json({ solicitud: { ...cab, lineas: lineas ?? [] } });
  }

  const { data, error } = await sb
    .from("admin_solicitud")
    .select("*")
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ solicitudes: data ?? [] });
}

// POST → crea una solicitud con sus líneas.
export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ error: "servidor no configurado" }, { status: 500 });

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const lineasIn = Array.isArray(b.lineas) ? (b.lineas as Record<string, unknown>[]) : [];
  if (lineasIn.length === 0) {
    return NextResponse.json({ error: "La solicitud necesita al menos una línea." }, { status: 400 });
  }

  const { data: cab, error: e1 } = await sb
    .from("admin_solicitud")
    .insert({ fecha: texto(b.fecha) ?? undefined, nota: texto(b.nota), estado: "pendiente" })
    .select("*")
    .single();
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });

  const filas = lineasIn.map((l, i) => ({ ...limpiarLinea(l, i), solicitud_id: cab.id }));
  const { error: e2 } = await sb.from("admin_solicitud_linea").insert(filas);
  if (e2) {
    await sb.from("admin_solicitud").delete().eq("id", cab.id);
    return NextResponse.json({ error: e2.message }, { status: 500 });
  }
  return NextResponse.json({ solicitud: cab });
}

// PATCH → cambia el estado (pendiente | procesada) o la nota.
export async function PATCH(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ error: "servidor no configurado" }, { status: 500 });

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = texto(b.id);
  if (!id) return NextResponse.json({ error: "falta id" }, { status: 400 });
  const cambios: Record<string, unknown> = {};
  if (b.estado === "pendiente" || b.estado === "procesada") cambios.estado = b.estado;
  if ("nota" in b) cambios.nota = texto(b.nota);
  if (Object.keys(cambios).length === 0) return NextResponse.json({ error: "nada que cambiar" }, { status: 400 });
  const { data, error } = await sb.from("admin_solicitud").update(cambios).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ solicitud: data });
}

// DELETE ?id=UUID → borra la solicitud (las líneas caen por cascade).
export async function DELETE(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ error: "servidor no configurado" }, { status: 500 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "falta id" }, { status: 400 });
  const { error } = await sb.from("admin_solicitud").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
