"use client";

import type { Tarea, Evento } from "./types";

const KEY_TAREAS = "qm_tareas_v1";
const KEY_EVENTOS = "qm_eventos_v1";

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

export function loadTareas(): Tarea[] {
  return read<Tarea[]>(KEY_TAREAS, []);
}

export function saveTareas(tareas: Tarea[]) {
  write(KEY_TAREAS, tareas);
}

export function loadEventos(): Evento[] {
  return read<Evento[]>(KEY_EVENTOS, []);
}

export function saveEventos(eventos: Evento[]) {
  write(KEY_EVENTOS, eventos);
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export const SAMPLE_TAREAS: Tarea[] = [
  {
    id: "sample-1",
    titulo: "Entrega de contratos a inquilinos",
    estado: "en_proceso",
    area: "Legal",
    prioridad: "alta",
    asignadoA: "Beatriz",
    createdAt: new Date().toISOString(),
  },
  {
    id: "sample-2",
    titulo: "Coordinar Pop Up Cocol's Choices + Port de Bras",
    estado: "pendiente",
    area: "Eventos",
    prioridad: "media",
    asignadoA: "Equipo",
    fechaLimite: "2026-05-29",
    createdAt: new Date().toISOString(),
  },
  {
    id: "sample-3",
    titulo: "Revisar pago Corpoelect",
    estado: "urgente",
    area: "Finanzas",
    prioridad: "alta",
    asignadoA: "Beatriz + Norberto",
    createdAt: new Date().toISOString(),
  },
];

export const SAMPLE_EVENTOS: Evento[] = [
  {
    id: "ev-1",
    titulo: "Pop Up Cocol's Choices + Port de Bras",
    fecha: "2026-05-29",
    estado: "por_confirmar",
  },
  {
    id: "ev-2",
    titulo: "Taller Arreglos Florales — AP Flora",
    fecha: "2026-05-06",
    estado: "realizado",
  },
  {
    id: "ev-3",
    titulo: "Pop Up Costaiia",
    fecha: "2026-05-09",
    estado: "por_confirmar",
  },
  {
    id: "ev-4",
    titulo: "Evento del 30 de mayo",
    fecha: "2026-05-30",
    estado: "confirmado",
    notas: "Evento más importante del mes",
  },
];

export function ensureSeeded() {
  if (typeof window === "undefined") return;
  if (!localStorage.getItem(KEY_TAREAS)) saveTareas(SAMPLE_TAREAS);
  if (!localStorage.getItem(KEY_EVENTOS)) saveEventos(SAMPLE_EVENTOS);
}
