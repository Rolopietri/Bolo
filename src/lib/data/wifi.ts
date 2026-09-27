"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { WifiConfig, WifiInvitado } from "@/lib/wifi";

/** Lista de invitados registrados, del más reciente al más viejo. */
export async function listarInvitados(): Promise<WifiInvitado[]> {
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb
    .from("wifi_invitados")
    .select("*")
    .order("ultima_visita", { ascending: false });
  if (error) throw error;
  return (data ?? []) as WifiInvitado[];
}

export async function borrarInvitado(id: string): Promise<void> {
  const sb = createSupabaseBrowserClient();
  const { error } = await sb.from("wifi_invitados").delete().eq("id", id);
  if (error) throw error;
}

export async function getWifiConfig(): Promise<WifiConfig> {
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb
    .from("wifi_config")
    .select("ssid, clave, mensaje")
    .eq("id", true)
    .maybeSingle();
  if (error) throw error;
  return {
    ssid: data?.ssid ?? "",
    clave: data?.clave ?? "",
    mensaje: data?.mensaje ?? "",
  };
}

export async function guardarWifiConfig(cfg: WifiConfig): Promise<WifiConfig> {
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb
    .from("wifi_config")
    .upsert(
      {
        id: true,
        ssid: cfg.ssid.trim(),
        clave: cfg.clave.trim(),
        mensaje: cfg.mensaje.trim(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    )
    .select("ssid, clave, mensaje")
    .single();
  if (error) throw error;
  return data as WifiConfig;
}
