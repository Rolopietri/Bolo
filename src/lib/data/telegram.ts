"use client";

// Grupo de Telegram de Producción (ver supabase/bolo-06-produccion-telegram.sql
// y las rutas /api/telegram/*).

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type EstadoTelegram = {
  configurado: boolean;
  bot_usuario?: string | null;
  codigo?: string | null;
  vinculado?: boolean;
  /** Vinculado al chat privado con el bot (no a un grupo). */
  privado?: boolean;
  chat_titulo?: string | null;
  activo?: boolean;
  /** Último aviso que mandó Telegram (para diagnosticar). */
  ultimo_aviso_at?: string | null;
  ultimo_aviso_chat?: string | null;
  ultimo_aviso_tipo?: string | null;
  ultima_accion?: string | null;
  /** Gerente que recibe el resumen diario en privado (BOLO-11). */
  resumen_nombre?: string | null;
  resumen_activo?: boolean;
};

export type DiagnosticoTelegram = {
  destino: string | null;
  enCola: number;
  ultimoError: string | null;
  ultimoErrorAt: string | null;
};

export async function diagnosticoTelegram(): Promise<DiagnosticoTelegram> {
  const r = await fetch("/api/telegram/diagnostico", { cache: "no-store" });
  const j = (await r.json().catch(() => ({}))) as DiagnosticoTelegram & { error?: string };
  if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
  return j;
}

export type Pendiente = {
  id: string;
  enviadoAt: string;
  remitente: string | null;
  texto: string | null;
  tieneFoto: boolean;
};

/** true si el error es porque falta correr el SQL de Telegram. */
export function faltaSqlTelegram(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  return /(telegram_|produccion_pendientes)/i.test(msg) && /(does not exist|no existe|schema cache|42P01|42883|PGRST202)/i.test(msg);
}

export async function estadoTelegram(): Promise<EstadoTelegram> {
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb.rpc("telegram_estado");
  if (error) throw error;
  return (data ?? { configurado: false }) as EstadoTelegram;
}

async function postJson(url: string, cuerpo?: unknown): Promise<unknown> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo ?? {}),
  });
  const j = (await r.json().catch(() => ({}))) as { error?: string };
  if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
  return j;
}

export async function conectarTelegram(token: string): Promise<EstadoTelegram> {
  return (await postJson("/api/telegram/configurar", { token })) as EstadoTelegram;
}

export async function desconectarTelegram(): Promise<void> {
  await postJson("/api/telegram/desconectar");
}

export async function activarTelegram(activo: boolean): Promise<EstadoTelegram> {
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb.rpc("telegram_activar", { p_activo: activo });
  if (error) throw error;
  return data as EstadoTelegram;
}

export async function listPendientes(): Promise<Pendiente[]> {
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb
    .from("produccion_pendientes")
    .select("id, enviado_at, remitente, texto, foto_file_id")
    .eq("estado", "pendiente")
    .order("enviado_at", { ascending: true })
    .limit(100);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as string,
    enviadoAt: r.enviado_at as string,
    remitente: (r.remitente as string | null) ?? null,
    texto: (r.texto as string | null) ?? null,
    tieneFoto: Boolean(r.foto_file_id),
  }));
}

export async function marcarPendiente(id: string, estado: "aprobado" | "descartado"): Promise<void> {
  const sb = createSupabaseBrowserClient();
  const { data: u } = await sb.auth.getUser();
  const { error } = await sb
    .from("produccion_pendientes")
    .update({ estado, revisado_por: u.user?.id ?? null, revisado_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export const urlFotoPendiente = (id: string) => `/api/telegram/foto?id=${encodeURIComponent(id)}`;

/** Registra al instante un mensaje que quedó pendiente de antes del registro
 *  directo (BOLO-10). Devuelve lo que hizo cada acción. */
export async function aplicarPendiente(
  id: string,
  acciones: unknown[],
  responsable: string | null,
): Promise<import("@/lib/telegram-acciones").ResultadoBot[]> {
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb.rpc("produccion_aplicar", {
    p_pendiente: id,
    p_acciones: acciones,
    p_responsable: responsable,
  });
  if (error) throw error;
  return (data ?? []) as import("@/lib/telegram-acciones").ResultadoBot[];
}

/** Deja de enviar el resumen diario al gerente. */
export async function quitarGerente(): Promise<EstadoTelegram> {
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb.rpc("telegram_quitar_gerente");
  if (error) throw error;
  return data as EstadoTelegram;
}
