import { NextResponse, type NextRequest } from "next/server";
import { tokenValido, ADMIN_COOKIE } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/admin-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function autorizado(req: NextRequest): boolean {
  return tokenValido(req.cookies.get(ADMIN_COOKIE)?.value);
}

const CAMPOS = ["nombre", "concepto", "cedula", "rif", "numero_cuenta", "banco"] as const;

function limpiar(b: Record<string, unknown>): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const c of CAMPOS) {
    const v = b[c];
    out[c] = typeof v === "string" && v.trim() ? v.trim() : null;
  }
  return out;
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ error: "servidor no configurado" }, { status: 500 });
  const { data, error } = await sb
    .from("admin_proveedor")
    .select("*")
    .eq("activo", true)
    .order("nombre", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ proveedores: data });
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ error: "servidor no configurado" }, { status: 500 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const fila = limpiar(b);
  if (!fila.nombre) return NextResponse.json({ error: "El nombre es obligatorio." }, { status: 400 });
  const { data, error } = await sb.from("admin_proveedor").insert(fila).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ proveedor: data });
}

export async function PATCH(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ error: "servidor no configurado" }, { status: 500 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = typeof b.id === "string" ? b.id : null;
  if (!id) return NextResponse.json({ error: "falta id" }, { status: 400 });
  const fila = limpiar(b);
  if (!fila.nombre) return NextResponse.json({ error: "El nombre es obligatorio." }, { status: 400 });
  const { data, error } = await sb.from("admin_proveedor").update(fila).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ proveedor: data });
}

// Borrado lógico (activo=false) de uno o varios: ?ids=uuid1,uuid2
export async function DELETE(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ error: "servidor no configurado" }, { status: 500 });
  const ids = (new URL(req.url).searchParams.get("ids") ?? "").split(",").filter(Boolean);
  if (ids.length === 0) return NextResponse.json({ error: "falta ids" }, { status: 400 });
  const { error } = await sb.from("admin_proveedor").update({ activo: false }).in("id", ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, borrados: ids.length });
}
