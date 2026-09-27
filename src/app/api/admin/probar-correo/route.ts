import { NextResponse, type NextRequest } from "next/server";
import { tokenValido, ADMIN_COOKIE } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/admin-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function autorizado(req: NextRequest): boolean {
  return tokenValido(req.cookies.get(ADMIN_COOKIE)?.value);
}

async function enviarResend(key: string, from: string, to: string, subject: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, text }),
  });
  if (r.ok) return { ok: true };
  const body = await r.text().catch(() => "");
  return { ok: false, error: `${r.status} · ${body.slice(0, 300)}` };
}

// POST → manda un correo de prueba a los correos de alerta configurados.
// Sirve para verificar que Resend está bien montado (sin esperar al cron).
export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });

  const key = process.env.RESEND_API_KEY;
  if (!key) return NextResponse.json({ sinConfig: true, error: "Falta RESEND_API_KEY en Vercel." });
  const from = process.env.RESEND_FROM || "Quinta Mamá <onboarding@resend.dev>";

  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ error: "servidor no configurado" }, { status: 500 });
  const cfg = await sb.from("admin_config").select("valor").eq("clave", "alerta_correos").maybeSingle();
  const correos = ((cfg.data?.valor as string | undefined) || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (correos.length === 0) {
    return NextResponse.json({ error: "No hay correos configurados. Guárdalos primero." }, { status: 400 });
  }

  let enviados = 0;
  const fallidos: string[] = [];
  let detalle: string | null = null;
  for (const to of correos) {
    const res = await enviarResend(
      key,
      from,
      to,
      "Prueba · Panel de Quinta Mamá",
      "Este es un correo de prueba del Panel de Administración de Quinta Mamá.\n\nSi lo recibes, Resend está funcionando y los recordatorios de cuentas por cobrar llegarán bien.\n\n— Administración · Quinta Mamá",
    );
    if (res.ok) enviados++;
    else { fallidos.push(to); if (!detalle) detalle = res.error ?? null; }
  }
  return NextResponse.json({ enviados, total: correos.length, fallidos, from, detalle });
}
