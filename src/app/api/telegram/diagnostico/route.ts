/**
 * Diagnóstico del bot de Producción: pregunta a Telegram a dónde manda los
 * avisos, cuántos tiene en cola y cuál fue el último error al entregarlos.
 * Requiere sesión. No devuelve el token.
 */
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { telegram } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type WebhookInfo = {
  url?: string;
  pending_update_count?: number;
  last_error_date?: number;
  last_error_message?: string;
};

export async function GET() {
  const sb = await createSupabaseServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });

  const { data: token } = await sb.rpc("telegram_token");
  if (typeof token !== "string" || !token) return NextResponse.json({ error: "No hay bot conectado." }, { status: 409 });

  try {
    const info = await telegram<WebhookInfo>(token, "getWebhookInfo");
    let destino: string | null = null;
    try {
      destino = info.url ? new URL(info.url).host : null;
    } catch {
      destino = null;
    }
    return NextResponse.json({
      destino,
      enCola: info.pending_update_count ?? 0,
      ultimoError: info.last_error_message ?? null,
      ultimoErrorAt: info.last_error_date ? new Date(info.last_error_date * 1000).toISOString() : null,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Telegram no respondió." }, { status: 502 });
  }
}
