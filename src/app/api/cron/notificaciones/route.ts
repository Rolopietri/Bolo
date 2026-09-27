/**
 * Cron diario del Sistema Operativo: envía por correo (Resend) los avisos de
 * asignación y vencimiento de tareas, sin duplicar.
 *
 * Config del cron en vercel.json (07:00 hora Caracas). Requiere en Vercel:
 *   - SUPABASE_SERVICE_ROLE_KEY  (leer/escribir sin sesión de usuario)
 *   - RESEND_API_KEY             (enviar correos)
 *   - RESEND_FROM                (remitente, ej. "Quinta Mamá <operaciones@quintamama.com>")
 *   - CRON_SECRET                (opcional; si está, se exige en el header)
 *
 * Si falta RESEND_API_KEY, la ruta no hace nada (no rompe el deploy).
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Recordatorios de vencimiento: días ANTES de la fecha límite (0 = el día que vence).
const DIAS_AVISO = [5, 3, 1, 0];

type TareaRow = {
  id: string; titulo: string; sub_eje_id: string; vence: string | null;
  creada: string; estado: string;
};
type RespRow = { tarea_id: string; persona_id: string };
type PersonaRow = { id: string; nombre: string; correo: string | null };

function caracasHoy(): string {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
  return new Date(utcMs - 4 * 60 * 60_000).toISOString().slice(0, 10);
}
function diffDias(a: string, b: string): number {
  return Math.round((new Date(a + "T12:00:00Z").getTime() - new Date(b + "T12:00:00Z").getTime()) / 86_400_000);
}

async function enviarResend(key: string, from: string, to: string, subject: string, text: string): Promise<boolean> {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, text }),
  });
  return r.ok;
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return NextResponse.json({ skipped: "RESEND_API_KEY no configurada" });
  }
  const from = process.env.RESEND_FROM || "Quinta Mamá <onboarding@resend.dev>";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "Supabase (service role) no configurado" }, { status: 500 });
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const [tareasR, respR, personasR, notifR] = await Promise.all([
    sb.from("so_tarea").select("id, titulo, sub_eje_id, vence, creada, estado").eq("estado", "pendiente"),
    sb.from("so_tarea_responsable").select("tarea_id, persona_id"),
    sb.from("so_persona").select("id, nombre, correo"),
    sb.from("so_notificacion").select("clave"),
  ]);
  if (tareasR.error || respR.error || personasR.error || notifR.error) {
    return NextResponse.json({ error: "error leyendo datos" }, { status: 500 });
  }

  const tareas = (tareasR.data as TareaRow[]) ?? [];
  const personas = new Map((personasR.data as PersonaRow[]).map((p) => [p.id, p]));
  const respPorTarea = new Map<string, string[]>();
  for (const r of respR.data as RespRow[]) {
    (respPorTarea.get(r.tarea_id) ?? respPorTarea.set(r.tarea_id, []).get(r.tarea_id)!).push(r.persona_id);
  }
  const yaEnviadas = new Set((notifR.data as { clave: string }[]).map((x) => x.clave));

  const hoy = caracasHoy();
  let enviadas = 0;
  const errores: string[] = [];

  // Recordatorio de cuentas por cobrar: en los últimos 5 días del mes, si hay
  // cuentas abiertas, avisa a los correos configurados. Se leen del panel
  // (admin_config.alerta_correos) y, si no hay, de ADMIN_ALERTA_EMAILS.
  const cfgR = await sb.from("admin_config").select("valor").eq("clave", "alerta_correos").maybeSingle();
  const fuenteCorreos = (cfgR.data?.valor as string | undefined) || process.env.ADMIN_ALERTA_EMAILS || "";
  const alertaTo = fuenteCorreos.split(",").map((s) => s.trim()).filter(Boolean);
  let cxcAviso = 0;
  if (alertaTo.length) {
    const [y, m, d] = hoy.split("-").map((x) => parseInt(x, 10));
    const ultimoDia = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const faltan = ultimoDia - d; // días hasta el cierre del mes
    if (faltan >= 0 && faltan <= 5) {
      // Saldo neto por cliente = Σ cuentas abiertas − Σ pagos.
      const [cxcR, pagoR] = await Promise.all([
        sb.from("admin_cuenta_cobrar").select("deudor, monto_usd").eq("cobrada", false),
        sb.from("admin_cxc_pago").select("cliente, monto_usd"),
      ]);
      const norm = (s: string | null) => (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
      const saldos = new Map<string, number>();
      for (const c of cxcR.data ?? []) saldos.set(norm(c.deudor), (saldos.get(norm(c.deudor)) ?? 0) + (Number(c.monto_usd) || 0));
      for (const p of pagoR.data ?? []) saldos.set(norm(p.cliente), (saldos.get(norm(p.cliente)) ?? 0) - (Number(p.monto_usd) || 0));
      const clientesConSaldo = [...saldos.values()].filter((v) => v > 0.01);
      if (clientesConSaldo.length > 0) {
        const usd = clientesConSaldo.reduce((s, v) => s + v, 0);
        const subject = `Cuentas por cobrar antes del cierre · ${clientesConSaldo.length} cliente${clientesConSaldo.length === 1 ? "" : "s"}`;
        const text = [
          `Faltan ${faltan} día${faltan === 1 ? "" : "s"} para que cierre el mes y hay clientes con saldo pendiente.`,
          "",
          `Clientes con saldo: ${clientesConSaldo.length}`,
          usd ? `Total aproximado: $${usd.toFixed(2)}` : "",
          "",
          "Entra al Panel de Administración → Cuentas por cobrar para cobrarlas.",
          "",
          "— Administración · Quinta Mamá",
        ].filter(Boolean).join("\n");
        for (const to of alertaTo) {
          const ok = await enviarResend(resendKey, from, to, subject, text);
          if (ok) cxcAviso++;
        }
      }
    }
  }

  for (const t of tareas) {
    for (const pid of respPorTarea.get(t.id) ?? []) {
      const persona = personas.get(pid);
      if (!persona?.correo) continue;

      const items: { tipo: "creada" | "vence" | "vencida"; clave: string; dias?: number }[] = [];
      const dCreada = diffDias(t.creada, hoy);
      if (dCreada <= 0 && dCreada >= -7) items.push({ tipo: "creada", clave: `${t.id}|creada|${pid}` });
      if (t.vence) {
        const d = diffDias(t.vence, hoy); // días que faltan (negativo = vencida)
        for (const off of DIAS_AVISO) {
          if (d === off) items.push({ tipo: "vence", dias: off, clave: `${t.id}|v${off}|${pid}` });
        }
        if (d < 0) items.push({ tipo: "vencida", clave: `${t.id}|vencida|${pid}` });
      }

      for (const it of items) {
        if (yaEnviadas.has(it.clave)) continue;
        const cabecera =
          it.tipo === "creada" ? "Se te asignó una tarea."
          : it.tipo === "vencida" ? "Tienes una tarea VENCIDA."
          : it.dias === 0 ? "Tienes una tarea que vence HOY."
          : `Tienes una tarea que vence en ${it.dias} día${it.dias === 1 ? "" : "s"}.`;
        const etiqueta =
          it.tipo === "creada" ? "Nueva tarea"
          : it.tipo === "vencida" ? "Vencida"
          : it.dias === 0 ? "Vence hoy"
          : `Faltan ${it.dias} d`;
        const subject = `${etiqueta} · ${t.id} · ${t.titulo}`;
        const text = [
          cabecera,
          "",
          `Tarea: ${t.titulo}`,
          `Identificador: ${t.id}`,
          `Sub-eje: ${t.sub_eje_id}`,
          `Vence: ${t.vence ?? "sin fecha"}`,
          "",
          "— Sistema Operativo · Quinta Mamá",
        ].join("\n");

        const ok = await enviarResend(resendKey, from, persona.correo, subject, text);
        if (!ok) { errores.push(it.clave); continue; }
        await sb.from("so_notificacion").upsert(
          { clave: it.clave, tarea_id: t.id, persona_id: pid, tipo: it.tipo },
          { onConflict: "clave" },
        );
        yaEnviadas.add(it.clave);
        enviadas++;
      }
    }
  }

  return NextResponse.json({ enviadas, errores: errores.length, cxcAviso });
}
