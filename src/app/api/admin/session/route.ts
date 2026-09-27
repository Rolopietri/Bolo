import { NextResponse, type NextRequest } from "next/server";
import { adminConfigurado, tokenValido, ADMIN_COOKIE } from "@/lib/admin-auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return NextResponse.json({
    configurado: adminConfigurado(),
    authed: tokenValido(req.cookies.get(ADMIN_COOKIE)?.value),
  });
}
