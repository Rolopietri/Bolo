"use client";

// Lotes de producción. Desde BOLO-06, Producción y "Procesar" son lo mismo:
// este módulo es un adaptador sobre la tabla `procesamientos` (crudo/procesado),
// que es la única fuente. "tomada" ≡ crudo (sin procesar) y "util" ≡ procesado.
// La tabla vieja `produccion_lotes` quedó sin uso.

import {
  listProcesamientosRango,
  borrarProcesamiento,
  type Procesamiento,
} from "@/lib/data/procesamientos";
import { registrarProcesamiento } from "@/lib/data/stock-movimientos";
import type { LoteProduccion } from "@/lib/produccion";

function aLote(p: Procesamiento): LoteProduccion {
  return {
    id: p.id,
    fecha: p.fecha,
    insumoId: p.insumoId,
    tomada: p.crudo,
    util: p.procesado,
    responsable: p.responsable ?? null,
    notas: p.nota ?? null,
    origen: p.origen,
  };
}

/** true si el error es porque la tabla todavía no se creó en la base. */
export function faltaTablaProduccion(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  return /procesamientos/i.test(msg) && /(does not exist|no existe|schema cache|42P01)/i.test(msg);
}

export async function listLotes(desde: string, hasta: string): Promise<LoteProduccion[]> {
  const procs = await listProcesamientosRango(desde, hasta);
  return procs.map(aLote);
}

export type NuevoLote = {
  fecha: string;
  insumoId: string;
  tomada: number;
  util: number;
  responsable?: string;
  notas?: string;
  origen: "manual" | "escaneo" | "telegram";
};

/** Registra cada lote como un procesamiento (crudo→procesado): baja el crudo,
 *  sube el procesado y deja la merma en el libro, todo en `procesamientos`. */
export async function crearLotes(lotes: NuevoLote[]): Promise<void> {
  for (const l of lotes) {
    await registrarProcesamiento({
      insumoId: l.insumoId,
      crudo: l.tomada,
      procesado: l.util,
      fecha: l.fecha,
      nota: l.notas,
      responsable: l.responsable,
      origen: l.origen,
    });
  }
}

export async function borrarLote(id: string): Promise<void> {
  await borrarProcesamiento(id);
}
