import { NextResponse, type NextRequest } from "next/server";
import { tokenValido, OPERADOR_COOKIE } from "@/lib/operador-auth";
import { createServiceClient } from "@/lib/supabase/admin-service";

export const runtime = "nodejs";

function autorizado(req: NextRequest): boolean {
  return tokenValido(req.cookies.get(OPERADOR_COOKIE)?.value);
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }
  const sb = createServiceClient();
  if (!sb) {
    return NextResponse.json({ error: "Falta la llave de servicio en Vercel." }, { status: 503 });
  }
  const body = (await req.json().catch(() => ({}))) as { id?: unknown; accion?: unknown };
  const id = typeof body.id === "string" ? body.id : "";
  const accion = typeof body.accion === "string" ? body.accion : "";
  if (!id || !accion) {
    return NextResponse.json({ error: "faltan datos" }, { status: 400 });
  }

  if (accion === "ocultar") {
    const { error } = await sb.from("marketplace_anuncios").update({ activo: false }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else if (accion === "activar") {
    const { error } = await sb.from("marketplace_anuncios").update({ activo: true }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else if (accion === "eliminar") {
    const { error } = await sb.from("marketplace_anuncios").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    return NextResponse.json({ error: "acción no válida" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
