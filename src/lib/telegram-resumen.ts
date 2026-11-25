// Resumen diario de producción que el bot le manda en privado al gerente
// (BOLO-11). Módulo puro: recibe los datos de _telegram_resumen_datos y arma
// el texto.

import { compararMerma } from "@/lib/produccion";
import { legible, type ResultadoBot } from "@/lib/telegram-acciones";

type Procesado = {
  nombre: string;
  unidad_base: string;
  crudo: number;
  procesado: number;
  merma_porc: number;
  estandar: number | null;
  responsable: string | null;
  nota: string | null;
};
type Abierto = { nombre: string; unidad_base: string; crudo: number; responsable: string | null; abierto_at: string };

export type DatosResumen = {
  fecha: string;
  mensajes: { remitente: string | null; resultado: ResultadoBot[] | null; enviado_at: string }[];
  procesados: Procesado[];
  abiertos: Abierto[];
  rechazados: { remitente: string | null; texto: string | null }[];
  avisos_pendientes: number;
  fotos_pendientes: number;
};

const ETIQUETA = { cumple: "se cumple", peor: "más merma", mejor: "menos merma", sin_estandar: "" } as const;

const fechaLarga = (iso: string) =>
  new Intl.DateTimeFormat("es-VE", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(`${iso}T12:00:00Z`),
  );
const horaCorta = (iso: string) =>
  new Intl.DateTimeFormat("es-VE", { hour: "numeric", minute: "2-digit", timeZone: "America/Caracas" }).format(new Date(iso));
const fechaHora = (iso: string) =>
  new Intl.DateTimeFormat("es-VE", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Caracas" }).format(
    new Date(iso),
  );

const diaCaracas = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(new Date(iso));

export function textoResumen(d: DatosResumen): string {
  const bloques: string[] = [];

  if (d.procesados.length) {
    bloques.push(
      ["Procesado", ...d.procesados.map((p) => {
        const real = Number(p.merma_porc);
        const est = p.estandar != null ? Number(p.estandar) : null;
        const etiqueta = ETIQUETA[compararMerma(real, est)];
        return `• ${p.nombre}: ${legible(Number(p.crudo), p.unidad_base)} → ${legible(Number(p.procesado), p.unidad_base)} · merma ${(Math.round(real * 10) / 10).toLocaleString("es-VE")} %${est != null ? ` (estándar ${est} %)` : ""}${etiqueta ? ` · ${etiqueta}` : ""}${p.nota ? ` · ${p.nota}` : ""}`;
      })].join("\n"),
    );
  }

  // Entradas a la mesa y salidas a uso por unidad, desde los mensajes aplicados.
  const entradas = new Map<string, { u: string; total: number; n: number; quien: Set<string> }>();
  const usos = new Map<string, { u: string; total: number; quien: Set<string> }>();
  const perdidas = new Map<string, { u: string; total: number; quien: Set<string> }>();
  const devoluciones = new Map<string, { u: string; total: number; quien: Set<string> }>();
  const sumar = (m: typeof usos, nombre: string, u: string, n: number, quien: string | null) => {
    const e = m.get(nombre) ?? { u, total: 0, quien: new Set<string>() };
    e.total += n;
    if (quien) e.quien.add(quien);
    m.set(nombre, e);
  };
  for (const m of d.mensajes) {
    for (const r of m.resultado ?? []) {
      if (!r.ok || !r.nombre) continue;
      const u = r.unidad_base ?? "";
      if (r.tipo === "entrada" || r.tipo === "completo") {
        const e = entradas.get(r.nombre) ?? { u, total: 0, n: 0, quien: new Set<string>() };
        e.total += Number(r.crudo ?? 0);
        e.n += 1;
        if (m.remitente) e.quien.add(m.remitente);
        entradas.set(r.nombre, e);
      } else if (r.tipo === "uso") {
        sumar(usos, r.nombre, u, Number(r.cantidad ?? 0), m.remitente);
      } else if (r.tipo === "perdida") {
        sumar(perdidas, r.nombre, u, Number(r.cantidad ?? 0), m.remitente);
      } else if (r.tipo === "devolucion") {
        sumar(devoluciones, r.nombre, u, Number(r.cantidad ?? 0), m.remitente);
      }
    }
  }
  if (entradas.size) {
    bloques.push(
      ["Entradas a la mesa", ...[...entradas].map(([n, e]) =>
        `• ${n}: ${legible(e.total, e.u)}${e.n > 1 ? ` en ${e.n} entradas` : ""}${e.quien.size ? ` (${[...e.quien].join(", ")})` : ""}`,
      )].join("\n"),
    );
  }
  if (usos.size) {
    bloques.push(
      ["Salió a uso por unidad", ...[...usos].map(([n, e]) =>
        `• ${n}: ${legible(e.total, e.u)}${e.quien.size ? ` (${[...e.quien].join(", ")})` : ""}`,
      )].join("\n"),
    );
  }
  const bloque = (titulo: string, m: typeof usos) => {
    if (m.size)
      bloques.push(
        [titulo, ...[...m].map(([n, e]) => `• ${n}: ${legible(e.total, e.u)}${e.quien.size ? ` (${[...e.quien].join(", ")})` : ""}`)].join("\n"),
      );
  };
  bloque("Pérdidas", perdidas);
  bloque("Devuelto al almacén", devoluciones);
  if (d.abiertos.length) {
    bloques.push(
      ["Sigue en la mesa", ...d.abiertos.map((a) =>
        `• ${a.nombre}: ${legible(Number(a.crudo), a.unidad_base)} desde ${
          diaCaracas(a.abierto_at) === d.fecha ? `las ${horaCorta(a.abierto_at)}` : fechaHora(a.abierto_at)
        }${a.responsable ? ` (${a.responsable})` : ""}`,
      )].join("\n"),
    );
  }
  if (d.rechazados.length) {
    bloques.push(
      ["No se registró", ...d.rechazados.map((r) => `• «${(r.texto ?? "").slice(0, 80)}»${r.remitente ? ` · ${r.remitente}` : ""}`)].join("\n"),
    );
  }
  const pend: string[] = [];
  if (d.avisos_pendientes) pend.push(`• ${d.avisos_pendientes} ${d.avisos_pendientes === 1 ? "venta" : "ventas"} sin nada en uso para confirmar`);
  if (d.fotos_pendientes) pend.push(`• ${d.fotos_pendientes} ${d.fotos_pendientes === 1 ? "foto" : "fotos"} por revisar en Producción`);
  if (pend.length) bloques.push(["Pendiente en Bolo", ...pend].join("\n"));

  const titulo = `Resumen de producción · ${fechaLarga(d.fecha)}`;
  if (!bloques.length) return `${titulo}\n\nHoy no hubo movimientos de producción.`;
  return `${titulo}\n\n${bloques.join("\n\n")}`;
}
