import { NextResponse } from "next/server";
import { parseIcsToEvents, calNameFromIcs } from "@/lib/google-calendar";

// node-ical necesita el runtime de Node (no edge).
export const runtime = "nodejs";
// Cachea los feeds ~10 min para no golpear a Google en cada carga.
export const revalidate = 600;

export async function GET() {
  const raw = process.env.GOOGLE_CALENDAR_ICS_URL;
  if (!raw) {
    // Sin configurar: no es un error, simplemente no hay eventos de Google.
    return NextResponse.json({ configured: false, events: [] });
  }

  // Se pueden poner VARIOS calendarios: una dirección iCal por línea (o
  // separadas por coma / espacios). Las URLs de Google no llevan esos caracteres.
  const urls = raw.split(/[\s,]+/).filter((u) => u.startsWith("http"));
  if (urls.length === 0) {
    return NextResponse.json({ configured: false, events: [] });
  }

  // Ventana: 3 meses atrás → 12 meses adelante (cubre la navegación normal).
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 13, 0);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const results = await Promise.allSettled(
    urls.map(async (url) => {
      const res = await fetch(url, { next: { revalidate: 600 } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      return parseIcsToEvents(text, iso(start), iso(end), calNameFromIcs(text));
    }),
  );

  const events = results.flatMap((r) =>
    r.status === "fulfilled" ? r.value : [],
  );
  const errores = results.filter((r) => r.status === "rejected").length;

  return NextResponse.json({
    configured: true,
    events,
    calendarios: urls.length,
    errores,
  });
}
