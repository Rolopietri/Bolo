import type { SupabaseClient } from "@supabase/supabase-js";

// Tasa de conversión euro → dólar del panel. Es fija/configurable (no se
// escribe en cada carga): 1 € = 1,17 $ por defecto. Se guarda en
// admin_config (clave 'tasa_eur_usd') y se puede cambiar cuando haga falta.
export const TASA_EUR_USD_DEFECTO = 1.17;

export async function getTasaEurUsd(sb: SupabaseClient): Promise<number> {
  const { data } = await sb.from("admin_config").select("valor").eq("clave", "tasa_eur_usd").maybeSingle();
  const v = Number(((data?.valor as string | undefined) ?? "").toString().replace(",", "."));
  return isFinite(v) && v > 0 ? v : TASA_EUR_USD_DEFECTO;
}
