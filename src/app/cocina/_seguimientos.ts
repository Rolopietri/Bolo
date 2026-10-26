// Bandeja de pendientes del asistente. Vive en este navegador (no es correo
// ni una tabla): alcanza para el demo y no toca la base ni el RLS.
import type { ClaveDestino } from "./_destinos";

export const EVENTO_SEGUIMIENTO = "bolo:seguimiento";
const KEY = "bolo-seguimientos";
const MAX = 30;

export type Seguimiento = {
  id: string;
  titulo: string;
  detalle: string;
  destino?: ClaveDestino;
  creado: string;
  leido: boolean;
};

export type SeguimientoNuevo = {
  titulo: string;
  detalle: string;
  destino?: ClaveDestino;
};

function leer(): Seguimiento[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as Seguimiento[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function guardar(items: Seguimiento[]) {
  localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX)));
  window.dispatchEvent(new CustomEvent(EVENTO_SEGUIMIENTO));
}

export function listarSeguimientos(): Seguimiento[] {
  return leer();
}

export function anotarSeguimiento(input: SeguimientoNuevo) {
  if (typeof window === "undefined") return;
  const titulo = input.titulo.trim().slice(0, 120);
  const detalle = input.detalle.trim().slice(0, 400);
  if (!titulo) return;
  const prev = leer();
  const clave = titulo.toLowerCase();
  if (prev.some((p) => !p.leido && p.titulo.toLowerCase() === clave)) return;
  const item: Seguimiento = {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : String(Date.now()),
    titulo,
    detalle: detalle || "Pendiente del asistente.",
    destino: input.destino,
    creado: new Date().toISOString(),
    leido: false,
  };
  guardar([item, ...prev]);
}

export function marcarSeguimientosLeidos() {
  if (typeof window === "undefined") return;
  const prev = leer();
  if (prev.every((p) => p.leido)) return;
  guardar(prev.map((p) => ({ ...p, leido: true })));
}

export function quitarSeguimiento(id: string) {
  if (typeof window === "undefined") return;
  guardar(leer().filter((p) => p.id !== id));
}
