import type { SupabaseClient } from "@supabase/supabase-js";

// IVA del panel. Las ventas facturadas traen el IVA incluido; el IVA NO es
// ingreso. Se separa: neto = monto / (1 + iva%). Configurable (por los momentos
// 16% y exentos Zelle + Dólar en efectivo).
export const IVA_PCT_DEFECTO = 16;
export const METODOS_SIN_IVA_DEFECTO = ["Zelle", "Dólar"];

function normaliza(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
}
function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type IvaConfig = { ivaPct: number; sinIva: string[] };

export async function getIvaConfig(sb: SupabaseClient): Promise<IvaConfig> {
  const { data } = await sb.from("admin_config").select("clave, valor").in("clave", ["iva_pct", "metodos_sin_iva"]);
  const map: Record<string, string | null> = {};
  for (const r of data ?? []) map[r.clave as string] = r.valor as string | null;
  const pct = Number((map.iva_pct ?? "").toString().replace(",", "."));
  const ivaPct = isFinite(pct) && pct >= 0 ? pct : IVA_PCT_DEFECTO;
  const sinRaw = map.metodos_sin_iva != null ? String(map.metodos_sin_iva) : METODOS_SIN_IVA_DEFECTO.join(", ");
  const sinIva = sinRaw.split(",").map((x) => normaliza(x)).filter(Boolean);
  return { ivaPct, sinIva };
}

// Separa un monto CON iva en { neto, iva }. Exento (o iva 0) → todo neto.
export function separaIva(gross: number, metodo: string, cfg: IvaConfig): { net: number; iva: number } {
  if (cfg.ivaPct <= 0 || cfg.sinIva.includes(normaliza(metodo))) return { net: r2(gross), iva: 0 };
  const net = gross / (1 + cfg.ivaPct / 100);
  return { net: r2(net), iva: r2(gross - net) };
}
