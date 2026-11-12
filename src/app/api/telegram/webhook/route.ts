/**
 * Aviso de Telegram por cada mensaje del grupo de producción. No usa sesión:
 * la función telegram_recibir valida la clave secreta que Telegram manda en la
 * cabecera, y guarda el mensaje como pendiente de aprobación.
 * Siempre responde 200 para que Telegram no reintente sin fin.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { telegram } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Resultado = { accion?: string; token?: string; chat_id?: number };

export async function POST(req: NextRequest) {
  const secreto = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  const update = await req.json().catch(() => null);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!secreto || !update || !url || !key) return NextResponse.json({ ok: true });

  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await sb.rpc("telegram_recibir", { p_secreto: secreto, p_update: update });
  if (error) {
    console.error("telegram_recibir", error.message);
    return NextResponse.json({ ok: true });
  }

  const r = (data ?? {}) as Resultado;
  if (r.token && r.chat_id && (r.accion === "vinculado" || r.accion === "codigo_invalido")) {
    const texto =
      r.accion === "vinculado"
        ? "Listo: este grupo quedó conectado a Bolo. Los registros de producción (texto o foto) llegarán a Producción para aprobación."
        : "Ese código no coincide. Revísalo en Bolo › Producción › Grupo de Telegram.";
    await telegram(r.token, "sendMessage", { chat_id: r.chat_id, text: texto }).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
