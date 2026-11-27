/**
 * El resumen de producción se manda al cerrar la jornada (cierre de caja o
 * cierre automático), no a las 11:00 p. m. Esta ruta:
 *  - POST: envía el resumen de una jornada (o de las pendientes).
 *  - GET (cron): repesca las jornadas cerradas que aún no se enviaron.
 *
 * Requiere SUPABASE_SERVICE_ROLE_KEY. El GET, si hay CRON_SECRET, lo exige
 * como hace Vercel Cron. El POST lo puede llamar la app al cerrar.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin-service";
import { telegram } from "@/lib/telegram";
import { textoResumen, type DatosResumen } from "@/lib/telegram-resumen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Servicio = {
  token?: string;
  chat_id?: number | null;
  datos?: DatosResumen;
  jornada_id?: string;
  fecha?: string;
};

async function enviarUno(
  sb: NonNullable<ReturnType<typeof createServiceClient>>,
  jornadaId: string,
): Promise<{ enviado: boolean; fecha?: string; skipped?: string; error?: string }> {
  const { data, error } = await sb.rpc("telegram_resumen_servicio_jornada", { p_jornada: jornadaId });
  if (error) return { enviado: false, error: error.message };
  const r = (data ?? {}) as Servicio;
  if (!r.token || !r.chat_id || !r.datos) {
    await sb.rpc("cocina_jornada_marcar_resumen", { p_jornada: jornadaId });
    return { enviado: false, skipped: "sin gerente vinculado", fecha: r.fecha };
  }
  try {
    await telegram(r.token, "sendMessage", { chat_id: r.chat_id, text: textoResumen(r.datos) });
    await sb.rpc("cocina_jornada_marcar_resumen", { p_jornada: jornadaId });
    return { enviado: true, fecha: r.fecha };
  } catch (e) {
    return { enviado: false, error: e instanceof Error ? e.message : "error", fecha: r.fecha };
  }
}

async function pendientes(sb: NonNullable<ReturnType<typeof createServiceClient>>): Promise<string[]> {
  const { data, error } = await sb.rpc("cocina_jornadas_resumen_pendiente");
  if (error) throw error;
  return ((data ?? []) as { jornada_id?: string }[]).map((r) => r.jornada_id).filter((id): id is string => !!id);
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }
  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ skipped: "SUPABASE_SERVICE_ROLE_KEY no configurada" });
  try {
    const ids = await pendientes(sb);
    const resultados = [];
    for (const id of ids) resultados.push(await enviarUno(sb, id));
    return NextResponse.json({ repesca: true, n: ids.length, resultados });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ skipped: "SUPABASE_SERVICE_ROLE_KEY no configurada" });
  let body: { jornadaId?: string; pendientes?: boolean } = {};
  try {
    body = (await req.json()) as { jornadaId?: string; pendientes?: boolean };
  } catch {
    body = { pendientes: true };
  }
  try {
    const ids = body.jornadaId ? [body.jornadaId] : await pendientes(sb);
    const resultados = [];
    for (const id of ids) resultados.push(await enviarUno(sb, id));
    return NextResponse.json({ n: ids.length, resultados });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
