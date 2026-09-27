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

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ error: "servidor no configurado" }, { status: 500 });
  const { data, error } = await sb
    .from("admin_categoria_ingreso")
    .select("*")
    .eq("activo", true)
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
  const { data, error } = await sb.from("admin_categoria_ingreso").insert({ nombre }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ categoria: data });
}

export async function DELETE(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ error: "servidor no configurado" }, { status: 500 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "falta id" }, { status: 400 });
  const { error } = await sb.from("admin_categoria_ingreso").update({ activo: false }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
