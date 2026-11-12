/**
 * Devuelve la foto de un mensaje pendiente del grupo de producción (la guarda
 * Telegram, no Bolo). Requiere sesión. El navegador la lee con el mismo lector
 * de la plantilla.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { descargarArchivo } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 });

  const sb = await createSupabaseServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });

  const { data: p } = await sb.from("produccion_pendientes").select("foto_file_id").eq("id", id).maybeSingle();
  if (!p?.foto_file_id) return NextResponse.json({ error: "sin foto" }, { status: 404 });
  const { data: token } = await sb.rpc("telegram_token");
  if (typeof token !== "string" || !token) return NextResponse.json({ error: "bot desconectado" }, { status: 409 });

  try {
    const { bytes, tipo } = await descargarArchivo(token, p.foto_file_id);
    return new NextResponse(bytes, { headers: { "Content-Type": tipo, "Cache-Control": "private, max-age=3600" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 502 });
  }
}
