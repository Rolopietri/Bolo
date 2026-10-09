import { NextResponse } from "next/server";
import { OPERADOR_COOKIE } from "@/lib/operador-auth";

export const runtime = "nodejs";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(OPERADOR_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
