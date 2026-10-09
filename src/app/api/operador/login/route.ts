import { NextResponse, type NextRequest } from "next/server";
import {
  operadorConfigurado,
  passwordCorrecta,
  crearToken,
  OPERADOR_COOKIE,
} from "@/lib/operador-auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!operadorConfigurado()) {
    return NextResponse.json(
      { error: "Panel de operador no configurado: falta OPERADOR_PASSWORD en Vercel." },
      { status: 503 },
    );
  }
  const body = (await req.json().catch(() => ({}))) as { password?: unknown };
  if (typeof body.password !== "string" || !passwordCorrecta(body.password)) {
    return NextResponse.json({ error: "Contraseña incorrecta." }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(OPERADOR_COOKIE, crearToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
  return res;
}
