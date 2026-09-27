import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Rutas sin sesión: el login y el portal de WiFi de invitados (el QR de las
// mesas cae en /wifi y el formulario postea a /api/wifi/registro).
const PUBLIC_PATHS = ["/login", "/auth", "/wifi", "/api/wifi/registro"];

export async function updateSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If Supabase isn't configured yet, skip auth — app runs in offline/localStorage mode.
  if (!url || !key) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

  if (!user && !isPublic) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/login";
    redirect.searchParams.set("next", path);
    return NextResponse.redirect(redirect);
  }

  if (user && path === "/login") {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/";
    redirect.searchParams.delete("next");
    return NextResponse.redirect(redirect);
  }

  return response;
}
