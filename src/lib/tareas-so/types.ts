// Sistema Operativo · Tipos del dominio (lado app)
// ═══════════════════════════════════════════════════════════════════
// Espejo en TypeScript de las tablas so_* (ver supabase/tareas-so-schema.sql).
// La capa de datos (src/lib/data/tareas-so.ts) convierte filas de Supabase
// (snake_case) a estos tipos (camelCase) y de vuelta.

import type { Horizonte, Valor, EstadoEspacio } from "./taxonomia";

export type { Horizonte, Valor, EstadoEspacio };

export type Impacto = "alto" | "medio" | "bajo" | "nulo";
export type Proximidad = "directa" | "requisito" | "apoyo";
export type Sentido = "mayor" | "menor";
export type EstadoTareaSO = "pendiente" | "completado" | "descartado";
export type OrigenTarea = "sistema" | "web" | "vercel" | "importado";

export type Persona = {
  id: string;
  nombre: string;
  correo?: string;
  activo: boolean;
  rol?: string;
  figura?: string;
};

export type Objetivo = {
  id: string;
  areaId: string;
  subEjeId: string;
  horizonte: Horizonte;
  titulo: string;
  indicador: string;
  meta: number;
  actual: number;
  unidad: string;
  sentido: Sentido;
};

export type Espacio = {
  id: string;
  nombre: string;
  planta: string;
  tipo: string;
  estado: EstadoEspacio;
  nota?: string;
};

export type Subtarea = {
  id: string;
  titulo: string;
  hecho: boolean;
  orden: number;
};

export type Comentario = {
  id: string;
  personaId?: string;
  autor?: string;
  fecha: string;
  texto: string;
};

export type Hito = {
  id: string;
  fecha: string;
  subEjeId?: string;
  tipo: string;
  texto: string;
  ref?: string;
  espacioId?: string;
  avance?: number;
  avanceAnterior?: number;
};

export type Tarea = {
  id: string;
  titulo: string;
  subEjeId: string;
  objetivoId?: string;
  espacioId?: string;
  vence?: string;
  creada: string;
  cerrada?: string;
  impacto: Impacto;
  proximidad: Proximidad;
  patrimonio: boolean;
  compromiso: boolean;
  nota?: string;
  estado: EstadoTareaSO;
  origen: OrigenTarea;
  /** Ids de personas responsables (N a N). Vacío = "Sin asignar". */
  responsables: string[];
  /** Valores asociados (incluye el pseudo-valor '__tensiona'). */
  valores: string[];
  subtareas: Subtarea[];
  comentarios: Comentario[];
};
