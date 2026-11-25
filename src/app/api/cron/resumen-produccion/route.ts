/**
 * Cron diario (vercel.json, ~11 p. m. hora Caracas): el bot le manda en
 * privado al gerente el resumen de producción del día (BOLO-11).
 *
 * Requiere en Vercel SUPABASE_SERVICE_ROLE_KEY (la misma de las otras rutas sin
 * sesión). Si CRON_SECRET está definido, se exige en la cabecera, como hace
 * Vercel Cron. Si no hay gerente vinculado, no hace nada.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin-service";
import { telegram } from "@/lib/telegram";
import { textoResumen, type DatosResumen } from "@/lib/telegram-resumen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }
  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ skipped: "SUPABASE_SERVICE_ROLE_KEY no configurada" });

  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(new Date());
  const { data, error } = await sb.rpc("telegram_resumen_servicio", { p_fecha: hoy });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const r = (data ?? {}) as { token?: string; chat_id?: number | null; datos?: DatosResumen };
  if (!r.token || !r.chat_id || !r.datos) return NextResponse.json({ skipped: "sin gerente vinculado" });

  try {
    await telegram(r.token, "sendMessage", { chat_id: r.chat_id, text: textoResumen(r.datos) });
    return NextResponse.json({ enviado: true, fecha: hoy });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 502 });
  }
}
