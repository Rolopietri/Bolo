// Monitoreo de tareas automáticas: registra cada corrida de un cron/reporte en
// la tabla `job_run`, para verlas luego en el panel de monitoreo. El registro
// nunca debe romper la tarea: si falla, se ignora en silencio.
import type { SupabaseClient } from "@supabase/supabase-js";

export type ResultadoCorrida = {
  estado: "ok" | "error";
  /** Resumen del resultado (ej: { enviadas: 3 }). */
  detalle?: unknown;
  /** Mensaje de error, si falló. */
  error?: string;
};

export async function registrarCorrida(
  sb: SupabaseClient,
  job: string,
  inicio: number,
  resultado: ResultadoCorrida,
): Promise<void> {
  try {
    await sb.from("job_run").insert({
      job,
      estado: resultado.estado,
      iniciado: new Date(inicio).toISOString(),
      finalizado: new Date().toISOString(),
      duracion_ms: Date.now() - inicio,
      detalle: (resultado.detalle ?? null) as never,
      error: resultado.error ?? null,
    });
  } catch {
    // Nunca romper la tarea por un fallo de registro.
  }
}
