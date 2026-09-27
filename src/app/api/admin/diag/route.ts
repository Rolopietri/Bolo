import { NextResponse, type NextRequest } from "next/server";
import { tokenValido, ADMIN_COOKIE } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Diagnóstico: solo dice si cada variable EXISTE (true/false), nunca su valor.
// Sirve para saber qué le falta a un deployment. Requiere estar logueado en admin.
export async function GET(req: NextRequest) {
  if (!tokenValido(req.cookies.get(ADMIN_COOKIE)?.value)) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }
  // Nombres (NO valores) de las variables relevantes que sí llegaron.
  // Sirve para cazar typos (espacios, mayúsculas, nombre incompleto).
  const nombresPresentes = Object.keys(process.env)
    .filter((k) => /^(SUPABASE|NEXT_PUBLIC_SUPABASE|RESEND|ADMIN|CRON)/i.test(k))
    .sort();

  return NextResponse.json({
    entorno: process.env.VERCEL_ENV ?? "desconocido",
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    tiene_NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    tiene_SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    tiene_NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    tiene_ADMIN_PASSWORD: !!process.env.ADMIN_PASSWORD,
    tiene_RESEND_API_KEY: !!process.env.RESEND_API_KEY,
    // Longitud del valor (0 = vacío) para saber si se pegó vacío:
    largo_SUPABASE_SERVICE_ROLE_KEY: (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").length,
    nombres_presentes: nombresPresentes,
  });
}
