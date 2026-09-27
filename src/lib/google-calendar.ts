// Lee un feed iCal (.ics) de Google Calendar y lo convierte en eventos simples
// para el calendario del panel. Solo servidor (usa node-ical). Read-only:
// Google → panel. Expande eventos recurrentes y respeta las excepciones
// (EXDATE) y overrides. Las fechas/horas se presentan en hora de Caracas.

import * as icalNs from "node-ical";

type RawEvent = {
  type?: string;
  uid?: string;
  summary?: string;
  start?: Date;
  end?: Date;
  datetype?: string; // "date" (día completo) | "date-time"
  rrule?: { between: (a: Date, b: Date, inc?: boolean) => Date[] };
  exdate?: Record<string, Date>;
  recurrences?: Record<
    string,
    { start?: Date; end?: Date; summary?: string; datetype?: string }
  >;
};

const ical = icalNs as unknown as {
  sync: { parseICS: (text: string) => Record<string, RawEvent> };
};

export type GCalEvent = {
  id: string;
  titulo: string;
  fecha: string; // YYYY-MM-DD
  fechaFin?: string; // YYYY-MM-DD (rango, opcional)
  hora?: string; // HH:MM (24h); ausente si es de día completo
  cal?: string; // nombre del calendario de origen (ej. "MASAJES QTA")
};

/** Extrae el nombre del calendario (X-WR-CALNAME) del texto .ics, si viene. */
export function calNameFromIcs(text: string): string | undefined {
  const m = text.match(/^X-WR-CALNAME:(.*)$/m);
  return m ? m[1].trim() : undefined;
}

const TZ = "America/Caracas";
const ymdF = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const hmF = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const ymdTz = (d: Date) => ymdF.format(d);
const hmTz = (d: Date) => {
  const s = hmF.format(d);
  return s === "24:00" ? "00:00" : s;
};
const ymdUtc = (d: Date) => d.toISOString().slice(0, 10);

function makeEvent(
  uid: string,
  summary: string | undefined,
  start: Date,
  end: Date | undefined,
  allDay: boolean,
  cal: string | undefined,
): GCalEvent {
  const titulo = (summary || "(sin título)").trim();
  if (allDay) {
    const fecha = ymdUtc(start);
    let fechaFin: string | undefined;
    // En iCal el DTEND de un evento de día completo es EXCLUSIVO.
    if (end) {
      const last = new Date(end.getTime() - 86_400_000);
      const f = ymdUtc(last);
      if (f > fecha) fechaFin = f;
    }
    return { id: `${uid}-${fecha}`, titulo, fecha, fechaFin, cal };
  }
  const fecha = ymdTz(start);
  let fechaFin: string | undefined;
  if (end) {
    const f = ymdTz(end);
    if (f > fecha) fechaFin = f;
  }
  return {
    id: `${uid}-${start.toISOString()}`,
    titulo,
    fecha,
    fechaFin,
    hora: hmTz(start),
    cal,
  };
}

/**
 * Parsea texto .ics y devuelve las ocurrencias entre rangeStart y rangeEnd
 * (ambos "YYYY-MM-DD"). Nunca lanza: ante cualquier error devuelve [].
 */
export function parseIcsToEvents(
  text: string,
  rangeStart: string,
  rangeEnd: string,
  cal?: string,
): GCalEvent[] {
  let data: Record<string, RawEvent>;
  try {
    data = ical.sync.parseICS(text);
  } catch {
    return [];
  }
  const rs = new Date(rangeStart + "T00:00:00Z");
  const re = new Date(rangeEnd + "T23:59:59Z");
  const out: GCalEvent[] = [];

  for (const k of Object.keys(data)) {
    const ev = data[k];
    if (!ev || ev.type !== "VEVENT" || !ev.start) continue;
    const allDay = ev.datetype === "date";
    const durMs = ev.end && ev.start ? ev.end.getTime() - ev.start.getTime() : 0;
    const uid = ev.uid || k;

    if (ev.rrule) {
      let occ: Date[] = [];
      try {
        occ = ev.rrule.between(rs, re, true);
      } catch {
        occ = [];
      }
      for (const d of occ) {
        const iso = d.toISOString();
        const day = iso.slice(0, 10);
        if (ev.exdate && (ev.exdate[iso] || ev.exdate[day])) continue;
        let start = d;
        let end = durMs ? new Date(d.getTime() + durMs) : undefined;
        let summary = ev.summary;
        let ad = allDay;
        const ov = ev.recurrences && (ev.recurrences[iso] || ev.recurrences[day]);
        if (ov) {
          start = ov.start || start;
          end = ov.end || end;
          summary = ov.summary ?? summary;
          ad = ov.datetype === "date";
        }
        out.push(makeEvent(uid, summary, start, end, ad, cal));
        if (out.length >= 2000) return out;
      }
    } else {
      const en = ev.end || ev.start;
      if (ev.start <= re && en >= rs) {
        out.push(makeEvent(uid, ev.summary, ev.start, ev.end, allDay, cal));
        if (out.length >= 2000) return out;
      }
    }
  }
  return out;
}
