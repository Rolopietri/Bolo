import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { tokenValido, ADMIN_COOKIE } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/admin-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function autorizado(req: NextRequest): boolean {
  return tokenValido(req.cookies.get(ADMIN_COOKIE)?.value);
}

// Sube una factura al bucket privado 'facturas' y devuelve su ruta.
export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ error: "servidor no configurado" }, { status: 500 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "falta el archivo" }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "el archivo supera 10 MB" }, { status: 400 });

  const limpio = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60);
  const path = `${new Date().getUTCFullYear()}/${crypto.randomUUID()}-${limpio}`;
  const buf = Buffer.from(await file.arrayBuffer());
  const { error } = await sb.storage.from("facturas").upload(path, buf, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ path });
}

// Devuelve una URL firmada temporal para ver una factura.
export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const sb = createServiceClient();
  if (!sb) return NextResponse.json({ error: "servidor no configurado" }, { status: 500 });
  const path = new URL(req.url).searchParams.get("path");
  if (!path) return NextResponse.json({ error: "falta path" }, { status: 400 });
  const { data, error } = await sb.storage.from("facturas").createSignedUrl(path, 3600);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ url: data.signedUrl });
}
