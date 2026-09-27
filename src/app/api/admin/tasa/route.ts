import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin-service";
import { getTasaEurUsd, TASA_EUR_USD_DEFECTO } from "@/lib/admin/tasa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Devuelve solo la tasa €→USD del panel (un número, no es secreto). La usa
// también Cocina/Ventas para convertir con los mismos parámetros que Admin.
export async function GET() {
  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ tasa: TASA_EUR_USD_DEFECTO });
  const tasa = await getTasaEurUsd(sb);
  return NextResponse.json({ tasa });
}
