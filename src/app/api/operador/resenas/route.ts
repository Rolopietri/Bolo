import { NextResponse, type NextRequest } from "next/server";
import { tokenValido, OPERADOR_COOKIE } from "@/lib/operador-auth";
import { createServiceClient } from "@/lib/supabase/admin-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function autorizado(req: NextRequest): boolean {
  return tokenValido(req.cookies.get(OPERADOR_COOKIE)?.value);
}

type ResenaRow = {
  id: string;
  anuncio_id: string;
  calificacion: number;
  comentario: string | null;
  autor_nombre: string | null;
  created_at: string;
};

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ error: "Falta la llave de servicio en Vercel." }, { status: 503 });

  const { data, error } = await sb
    .from("marketplace_resenas")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const resenas = (data ?? []) as ResenaRow[];

  const ids = [...new Set(resenas.map((r) => r.anuncio_id))];
  const titulos: Record<string, string> = {};
  if (ids.length) {
    const { data: ans } = await sb.from("marketplace_anuncios").select("id,titulo").in("id", ids);
    for (const a of (ans ?? []) as { id: string; titulo: string }[]) titulos[a.id] = a.titulo;
  }

  return NextResponse.json({ resenas, titulos });
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ error: "Falta la llave de servicio en Vercel." }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { id?: unknown };
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "faltan datos" }, { status: 400 });

  const { error } = await sb.from("marketplace_resenas").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
