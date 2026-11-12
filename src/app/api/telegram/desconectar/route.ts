/** Desconecta el bot de Producción: quita el webhook en Telegram y borra la configuración. */
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { telegram } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const sb = await createSupabaseServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });

  const { data: token, error } = await sb.rpc("telegram_desconectar");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (typeof token === "string" && token) {
    await telegram(token, "deleteWebhook", { drop_pending_updates: true }).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
