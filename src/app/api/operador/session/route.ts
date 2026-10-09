import { NextResponse, type NextRequest } from "next/server";
import { operadorConfigurado, tokenValido, OPERADOR_COOKIE } from "@/lib/operador-auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return NextResponse.json({
    configurado: operadorConfigurado(),
    authed: tokenValido(req.cookies.get(OPERADOR_COOKIE)?.value),
  });
}
