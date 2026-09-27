import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function allowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json(
      { error: "Servidor no configurado todavía. Contacta al administrador." },
      { status: 503 },
    );
  }

  let body: { email?: string; next?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  }

  const email = (body.email || "").trim().toLowerCase();
  const next = body.next || "/";
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Correo inválido" }, { status: 400 });
  }

  const whitelist = allowedEmails();
  if (whitelist.length > 0 && !whitelist.includes(email)) {
    return NextResponse.json(
      { error: "Este correo no está autorizado para entrar." },
      { status: 403 },
    );
  }

  const origin = new URL(request.url).origin;
  const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(next)}`;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectTo,
      shouldCreateUser: true,
    },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
