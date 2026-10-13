import { NextResponse, type NextRequest } from "next/server";
import { tokenValido, OPERADOR_COOKIE } from "@/lib/operador-auth";
import { createServiceClient } from "@/lib/supabase/admin-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function autorizado(req: NextRequest): boolean {
  return tokenValido(req.cookies.get(OPERADOR_COOKIE)?.value);
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ error: "Falta la llave de servicio en Vercel." }, { status: 503 });

  const { data, error } = await sb
    .from("marketplace_anuncios")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ anuncios: data ?? [] });
}
