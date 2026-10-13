import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { tokenValido, OPERADOR_COOKIE } from "@/lib/operador-auth";
import { createServiceClient } from "@/lib/supabase/admin-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function autorizado(req: NextRequest): boolean {
  return tokenValido(req.cookies.get(OPERADOR_COOKIE)?.value);
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ error: "Falta la llave de servicio en Vercel." }, { status: 503 });

  const { data, error } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const usuarios = (data.users ?? []).map((u) => {
    const extra = u as unknown as { banned_until?: string | null };
    const bloqueado =
      !!extra.banned_until && new Date(extra.banned_until).getTime() > Date.now();
    return {
      id: u.id,
      email: u.email ?? "(sin correo)",
      creado: u.created_at ?? null,
      ultimoAcceso: u.last_sign_in_at ?? null,
      bloqueado,
    };
  });
  // Más recientes primero por último acceso (o creación).
  usuarios.sort((a, b) => {
    const ta = new Date(a.ultimoAcceso ?? a.creado ?? 0).getTime();
    const tb = new Date(b.ultimoAcceso ?? b.creado ?? 0).getTime();
    return tb - ta;
  });

  return NextResponse.json({ usuarios });
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ error: "Falta la llave de servicio en Vercel." }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { id?: unknown; accion?: unknown };
  const id = typeof body.id === "string" ? body.id : "";
  const accion = typeof body.accion === "string" ? body.accion : "";
  if (!id || !accion) return NextResponse.json({ error: "faltan datos" }, { status: 400 });

  if (accion === "resetpass") {
    const nueva = "bolo-" + crypto.randomBytes(3).toString("hex");
    const { error } = await sb.auth.admin.updateUserById(id, { password: nueva });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, nueva });
  }
  if (accion === "desactivar") {
    const { error } = await sb.auth.admin.updateUserById(id, {
      ban_duration: "876000h",
    } as { ban_duration: string });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  if (accion === "activar") {
    const { error } = await sb.auth.admin.updateUserById(id, {
      ban_duration: "none",
    } as { ban_duration: string });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  if (accion === "eliminar") {
    const { error } = await sb.auth.admin.deleteUser(id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "acción no válida" }, { status: 400 });
}
