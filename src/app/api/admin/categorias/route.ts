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
function clasif(v: unknown): "fija" | "variable" {
  return v === "fija" ? "fija" : "variable";
}

// GET → catálogo activo, ordenado por clasificación y nombre.
export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ error: "servidor no configurado" }, { status: 500 });
  const { data, error } = await sb
    .from("admin_categoria")
    .select("*")
    .eq("activo", true)
    .order("clasificacion", { ascending: true })
    .order("nombre", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ categorias: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ error: "servidor no configurado" }, { status: 500 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const nombre = texto(b.nombre);
  if (!nombre) return NextResponse.json({ error: "El nombre es obligatorio." }, { status: 400 });

  // El nombre es único sin distinguir mayúsculas (idx sobre lower(nombre)), e
  // incluye las inactivas (borrado lógico). Si ya existe una con ese nombre:
  //   • activa → se devuelve tal cual (idempotente, sin error).
  //   • inactiva → se REACTIVA (con la clasificación pedida) en vez de fallar.
  const existentes = await sb.from("admin_categoria").select("*").ilike("nombre", nombre);
  const ya = (existentes.data ?? []).find((c) => (c.nombre ?? "").toLowerCase() === nombre.toLowerCase());
  if (ya) {
    if (ya.activo) return NextResponse.json({ categoria: ya });
    const { data, error } = await sb
      .from("admin_categoria")
      .update({ activo: true, clasificacion: clasif(b.clasificacion) })
      .eq("id", ya.id)
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ categoria: data });
  }

  const { data, error } = await sb
    .from("admin_categoria")
    .insert({ nombre, clasificacion: clasif(b.clasificacion) })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ categoria: data });
}

export async function PATCH(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ error: "servidor no configurado" }, { status: 500 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = texto(b.id);
  if (!id) return NextResponse.json({ error: "falta id" }, { status: 400 });
  const cambios: Record<string, unknown> = {};
  if (texto(b.nombre)) cambios.nombre = texto(b.nombre);
  if (b.clasificacion !== undefined) cambios.clasificacion = clasif(b.clasificacion);
  const { data, error } = await sb.from("admin_categoria").update(cambios).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ categoria: data });
}

// Borrado lógico (activo=false) para no romper egresos históricos.
export async function DELETE(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ error: "servidor no configurado" }, { status: 500 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "falta id" }, { status: 400 });
  const { error } = await sb.from("admin_categoria").update({ activo: false }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
