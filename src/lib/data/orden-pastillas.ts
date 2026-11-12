"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { normalizarOrdenHome } from "@/lib/orden-pastillas.mjs";

/** Disposición del Home. Null = la del catálogo. */
export type OrdenPastillas = {
  layout?: { id: string; col: number }[];
  pastillas?: Record<string, string[]>;
};

export type LecturaOrden = {
  orden: OrdenPastillas | null;
  /**
   * sin_columna: la tabla o la columna orden_modulos todavía no existen.
   * sin_conexion: no hay proyecto de Supabase configurado, o falló la red.
   * ok: se leyó la fila (el orden puede ser null).
   */
  estado: "ok" | "sin_columna" | "sin_conexion";
};

type ErrorSb = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

function texto(error: ErrorSb | null | undefined): string {
  if (!error) return "";
  return `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`.toLowerCase();
}

/** La columna (o la tabla) no está en la base. El Home sigue con el orden por defecto. */
export function columnaOrdenAusente(error: ErrorSb | null | undefined): boolean {
  const t = texto(error);
  return (
    t.includes("42703") ||
    t.includes("42p01") ||
    t.includes("pgrst204") ||
    t.includes("pgrst205") ||
    t.includes("orden_modulos") ||
    t.includes("schema cache") ||
    t.includes("does not exist") ||
    t.includes("could not find") ||
    t.includes("undefined_column") ||
    t.includes("undefined_table")
  );
}

function sinConexion(error: ErrorSb | null | undefined): boolean {
  const t = texto(error);
  return (
    t.includes("failed to fetch") ||
    t.includes("network") ||
    t.includes("supabaseurl is required") ||
    t.includes("url and api key") ||
    t.includes("fetch failed")
  );
}

function cliente() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    const error = new Error("sin_conexion");
    error.name = "sin_conexion";
    throw error;
  }
  return createSupabaseBrowserClient();
}

export async function leerOrdenPastillas(): Promise<LecturaOrden> {
  try {
    const sb = cliente();
    const { data, error } = await sb
      .from("restaurante_ajustes")
      .select("orden_modulos")
      .eq("id", 1)
      .maybeSingle();
    if (error) {
      if (columnaOrdenAusente(error)) return { orden: null, estado: "sin_columna" };
      if (sinConexion(error)) return { orden: null, estado: "sin_conexion" };
      return { orden: null, estado: "ok" };
    }
    const fila = data as { orden_modulos?: unknown } | null;
    const home = normalizarOrdenHome(fila?.orden_modulos ?? null);
    return {
      orden: home
        ? {
            pastillas: home.pastillas,
            ...(home.layout ? { layout: home.layout } : {}),
          }
        : null,
      estado: "ok",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "sin_conexion" || sinConexion({ message: msg })) {
      return { orden: null, estado: "sin_conexion" };
    }
    return { orden: null, estado: "ok" };
  }
}

/**
 * Guarda el orden del restaurante (fila id = 1). Null vuelve al orden por defecto.
 * Lanza Error con message "sin_columna" o "sin_conexion" si no se puede persistir.
 */
export async function guardarOrdenPastillas(orden: OrdenPastillas | null): Promise<void> {
  let sb: ReturnType<typeof createSupabaseBrowserClient>;
  try {
    sb = cliente();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "sin_conexion";
    throw new Error(msg === "sin_conexion" ? "sin_conexion" : "sin_conexion");
  }

  const payload = {
    orden_modulos: orden,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await sb
    .from("restaurante_ajustes")
    .update(payload)
    .eq("id", 1)
    .select("id");

  if (error) {
    if (columnaOrdenAusente(error)) throw new Error("sin_columna");
    if (sinConexion(error)) throw new Error("sin_conexion");
    throw new Error(error.message);
  }

  if (data && data.length > 0) return;

  const ins = await sb.from("restaurante_ajustes").insert({ id: 1, ...payload });
  if (ins.error) {
    if (columnaOrdenAusente(ins.error)) throw new Error("sin_columna");
    if (sinConexion(ins.error)) throw new Error("sin_conexion");
    // La fila ya existía: el update no devolvió filas, pero el orden quedó.
    const t = texto(ins.error);
    if (t.includes("23505") || t.includes("duplicate")) return;
    throw new Error(ins.error.message);
  }
}
