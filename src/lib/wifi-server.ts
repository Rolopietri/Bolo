// WiFi de invitados · utilidades que solo corren en el servidor.
import { createServiceClient } from "@/lib/supabase/admin-service";
import type { WifiConfig } from "@/lib/wifi";

/** Cookie que recuerda al invitado ya registrado (no vuelve a llenar el form). */
export const COOKIE_WIFI = "qm_wifi";
export const DIAS_COOKIE = 180;

/**
 * Credenciales del WiFi: salen de la tabla `wifi_config` (leída con
 * service-role, porque el invitado no tiene sesión) y, si no hay service-role
 * configurado, de las variables WIFI_SSID / WIFI_CLAVE / WIFI_MENSAJE.
 */
export async function credencialesWifi(): Promise<WifiConfig | null> {
  const service = createServiceClient();
  if (service) {
    const { data } = await service
      .from("wifi_config")
      .select("ssid, clave, mensaje")
      .eq("id", true)
      .maybeSingle();
    if (data?.ssid && data?.clave) {
      return { ssid: data.ssid, clave: data.clave, mensaje: data.mensaje ?? "" };
    }
  }
  const ssid = process.env.WIFI_SSID;
  const clave = process.env.WIFI_CLAVE;
  if (ssid && clave) {
    return { ssid, clave, mensaje: process.env.WIFI_MENSAJE ?? "" };
  }
  return null;
}
