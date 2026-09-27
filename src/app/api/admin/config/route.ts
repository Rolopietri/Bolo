import { NextResponse, type NextRequest } from "next/server";
import { tokenValido, ADMIN_COOKIE } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/admin-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function autorizado(req: NextRequest): boolean {
  return tokenValido(req.cookies.get(ADMIN_COOKIE)?.value);
}

// GET → devuelve todos los ajustes como { clave: valor }.
export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ error: "servidor no configurado" }, { status: 500 });
  const { data, error } = await sb.from("admin_config").select("clave, valor");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const config: Record<string, string | null> = {};
  for (const row of data ?? []) config[row.clave] = row.valor;
  return NextResponse.json({ config });
}

// POST { clave, valor } → guarda (upsert) un ajuste.
export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ error: "servidor no configurado" }, { status: 500 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const clave = typeof b.clave === "string" && b.clave.trim() ? b.clave.trim() : null;
  if (!clave) return NextResponse.json({ error: "falta clave" }, { status: 400 });
  const valor = typeof b.valor === "string" ? b.valor : b.valor == null ? null : String(b.valor);
  const { error } = await sb
    .from("admin_config")
    .upsert({ clave, valor, updated_at: new Date().toISOString() }, { onConflict: "clave" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
