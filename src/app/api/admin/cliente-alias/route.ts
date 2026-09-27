import { NextResponse, type NextRequest } from "next/server";
import { tokenValido, ADMIN_COOKIE } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/admin-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function autorizado(req: NextRequest): boolean {
  return tokenValido(req.cookies.get(ADMIN_COOKIE)?.value);
}
function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function claveCliente(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
}

// GET → lista de alias { alias_key, canonico }
export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ error: "servidor no configurado" }, { status: 500 });
  const { data, error } = await sb.from("admin_cliente_alias").select("alias_key, canonico").order("canonico");
  if (error) return NextResponse.json({ aliases: [] }); // tabla ausente → sin alias
  return NextResponse.json({ aliases: data ?? [] });
}

// POST { alias, canonico } → une 'alias' al cliente 'canonico'.
export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ error: "servidor no configurado" }, { status: 500 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const alias = texto(b.alias);
  let canonico = texto(b.canonico);
  if (!alias || !canonico) return NextResponse.json({ error: "Faltan los nombres." }, { status: 400 });
  const aliasKey = claveCliente(alias);
  if (aliasKey === claveCliente(canonico)) return NextResponse.json({ error: "Son el mismo nombre." }, { status: 400 });

  // Si el canónico elegido es a su vez un alias, resuelve a su canónico final
  // (evita cadenas A→B→C).
  const { data: existentes } = await sb.from("admin_cliente_alias").select("alias_key, canonico");
  const mapa = new Map((existentes ?? []).map((r) => [r.alias_key as string, r.canonico as string]));
  let guard = 0;
  while (mapa.has(claveCliente(canonico!)) && guard++ < 20) canonico = mapa.get(claveCliente(canonico!))!;

  const { error } = await sb
    .from("admin_cliente_alias")
    .upsert({ alias_key: aliasKey, canonico }, { onConflict: "alias_key" });
  if (error) {
    const falta = (error as { code?: string }).code === "42P01" || /does not exist|schema cache/i.test(error.message);
    return NextResponse.json({ error: falta ? "Falta la tabla admin_cliente_alias. Corre 'supabase/admin-cliente-alias.sql'." : error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, canonico });
}

// DELETE ?alias_key=... → deshace la unión de ese nombre.
export async function DELETE(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ error: "servidor no configurado" }, { status: 500 });
  const k = new URL(req.url).searchParams.get("alias_key");
  if (!k) return NextResponse.json({ error: "falta alias_key" }, { status: 400 });
  const { error } = await sb.from("admin_cliente_alias").delete().eq("alias_key", k);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
