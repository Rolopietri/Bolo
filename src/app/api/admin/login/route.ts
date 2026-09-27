import { NextResponse, type NextRequest } from "next/server";
import { adminConfigurado, passwordCorrecta, crearToken, ADMIN_COOKIE } from "@/lib/admin-auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!adminConfigurado()) {
    return NextResponse.json(
      { error: "Administración no configurada: falta ADMIN_PASSWORD en Vercel." },
      { status: 503 },
    );
  }
  const body = (await req.json().catch(() => ({}))) as { password?: unknown };
  if (typeof body.password !== "string" || !passwordCorrecta(body.password)) {
    return NextResponse.json({ error: "Contraseña incorrecta." }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, crearToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
  return res;
}
