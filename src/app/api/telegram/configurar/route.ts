/**
 * Conecta el bot de Telegram de Producción: valida el token, registra en
 * Telegram la dirección de avisos (webhook) con una clave secreta nueva y
 * guarda todo en la base. Requiere sesión de Bolo.
 */
import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TOKEN_VALIDO, telegram } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function origenPublico(req: NextRequest): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  return `${proto}://${host}`;
}

export async function POST(req: NextRequest) {
  const sb = await createSupabaseServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión para conectar el bot." }, { status: 401 });

  const b = (await req.json().catch(() => ({}))) as { token?: unknown };
  const token = typeof b.token === "string" ? b.token.trim() : "";
  if (!TOKEN_VALIDO.test(token)) {
    return NextResponse.json(
      { error: "Ese token no tiene el formato de Telegram (números, dos puntos y letras)." },
      { status: 400 },
    );
  }

  const origen = origenPublico(req);
  if (!origen.startsWith("https://") || /localhost|127\.0\.0\.1/.test(origen)) {
    return NextResponse.json(
      { error: "Conecta el bot desde la página en línea de Bolo: Telegram no puede enviar avisos a esta computadora." },
      { status: 400 },
    );
  }

  try {
    const bot = await telegram<{ username?: string }>(token, "getMe");
    const secreto = randomBytes(24).toString("hex");
    await telegram(token, "setWebhook", {
      url: `${origen}/api/telegram/webhook`,
      secret_token: secreto,
      allowed_updates: ["message"],
      drop_pending_updates: true,
    });
    const { data, error } = await sb.rpc("telegram_configurar", {
      p_token: token,
      p_usuario: bot.username ?? null,
      p_secreto: secreto,
    });
    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const legible = /unauthorized|not found/i.test(msg) ? "Telegram no reconoce ese token. Cópialo de nuevo desde @BotFather." : msg;
    return NextResponse.json({ error: legible }, { status: 400 });
  }
}
