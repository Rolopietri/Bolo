import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function allowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const next = url.searchParams.get("next") || "/";
  const errorDescription = url.searchParams.get("error_description");

  if (errorDescription) {
    return NextResponse.redirect(
      `${url.origin}/login?error=${encodeURIComponent(errorDescription)}`,
    );
  }

  const supabase = await createSupabaseServerClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(
        `${url.origin}/login?error=${encodeURIComponent(error.message)}`,
      );
    }
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as "email" | "magiclink" | "recovery" | "invite" | "signup",
    });
    if (error) {
      return NextResponse.redirect(
        `${url.origin}/login?error=${encodeURIComponent(error.message)}`,
      );
    }
  } else {
    return NextResponse.redirect(`${url.origin}/login?error=missing_code`);
  }

  // After establishing session, verify email is in whitelist (defense for OAuth flows).
  const whitelist = allowedEmails();
  if (whitelist.length > 0) {
    const { data } = await supabase.auth.getUser();
    const email = data.user?.email?.toLowerCase();
    if (!email || !whitelist.includes(email)) {
      await supabase.auth.signOut();
      return NextResponse.redirect(
        `${url.origin}/login?error=${encodeURIComponent("Este correo no está autorizado para entrar.")}`,
      );
    }
  }

  return NextResponse.redirect(`${url.origin}${next}`);
}
