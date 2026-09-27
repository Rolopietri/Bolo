/**
 * Envía al instante el correo de asignación a los responsables de una tarea
 * recién creada. Lo llama el cliente después de crear la tarea. Marca la
 * notificación 'creada' para que el cron diario no la vuelva a mandar.
 *
 * Requiere en el entorno: SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL,
 * RESEND_API_KEY, RESEND_FROM. Si falta Resend, responde skipped (no rompe).
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function enviarResend(key: string, from: string, to: string, subject: string, text: string): Promise<boolean> {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, text }),
  });
  return r.ok;
}

export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const taskId = typeof b.taskId === "string" ? b.taskId : null;
  if (!taskId) return NextResponse.json({ error: "falta taskId" }, { status: 400 });

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return NextResponse.json({ skipped: "RESEND_API_KEY no configurada" });
  const from = process.env.RESEND_FROM || "Quinta Mamá <onboarding@resend.dev>";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Supabase (service role) no configurado" }, { status: 500 });
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data: tarea, error: e1 } = await sb
    .from("so_tarea")
    .select("id, titulo, sub_eje_id, vence")
    .eq("id", taskId)
    .single();
  if (e1 || !tarea) return NextResponse.json({ error: "tarea no encontrada" }, { status: 404 });

  const { data: resp } = await sb.from("so_tarea_responsable").select("persona_id").eq("tarea_id", taskId);
  const ids = (resp ?? []).map((r) => r.persona_id).filter(Boolean) as string[];
  if (ids.length === 0) return NextResponse.json({ enviadas: 0 });

  const { data: personas } = await sb.from("so_persona").select("id, nombre, correo").in("id", ids);
  let enviadas = 0;
  for (const p of personas ?? []) {
    if (!p.correo) continue;
    const subject = `Nueva tarea · ${tarea.id} · ${tarea.titulo}`;
    const text = [
      `Hola ${p.nombre},`,
      "",
      "Se te asignó una tarea.",
      "",
      `Tarea: ${tarea.titulo}`,
      `Identificador: ${tarea.id}`,
      `Sub-eje: ${tarea.sub_eje_id}`,
      `Vence: ${tarea.vence ?? "sin fecha"}`,
      "",
      "— Sistema Operativo · Quinta Mamá",
    ].join("\n");
    const ok = await enviarResend(resendKey, from, p.correo, subject, text);
    if (!ok) continue;
    await sb.from("so_notificacion").upsert(
      { clave: `${tarea.id}|creada|${p.id}`, tarea_id: tarea.id, persona_id: p.id, tipo: "creada" },
      { onConflict: "clave" },
    );
    enviadas++;
  }
  return NextResponse.json({ enviadas });
}
