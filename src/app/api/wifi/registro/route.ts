/**
 * WiFi de invitados · registro público (sin sesión).
 *
 * El invitado escanea el QR, llena el formulario en /wifi y este endpoint:
 *   1. valida los datos,
 *   2. los guarda en `wifi_invitados` (función `wifi_registrar`, que suma
 *      visita si el correo ya existe),
 *   3. recién entonces devuelve la clave del WiFi.
 *
 * La clave sale de la tabla `wifi_config` (leída con service-role) o, si no
 * hay service-role configurado, de las variables WIFI_SSID / WIFI_CLAVE.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin-service";
import { COOKIE_WIFI, DIAS_COOKIE, credencialesWifi } from "@/lib/wifi-server";
import {
  normalizarCedula,
  normalizarEmail,
  normalizarTelefono,
  validarRegistro,
} from "@/lib/wifi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Tope simple por IP para que nadie llene la tabla de basura. */
const LIMITE_POR_HORA = 20;
const golpes = new Map<string, number[]>();

function pasaLimite(ip: string): boolean {
  const ahora = Date.now();
  const hora = 60 * 60 * 1000;
  const previos = (golpes.get(ip) ?? []).filter((t) => ahora - t < hora);
  previos.push(ahora);
  golpes.set(ip, previos);
  return previos.length <= LIMITE_POR_HORA;
}

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  if (!pasaLimite(ip)) {
    return NextResponse.json(
      { error: "Demasiados intentos. Espera un rato e inténtalo de nuevo." },
      { status: 429 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }

  const registro = {
    nombre: String(body.nombre ?? "").trim().slice(0, 120),
    email: normalizarEmail(String(body.email ?? "")),
    telefono: String(body.telefono ?? "").trim(),
    cedula: normalizarCedula(String(body.cedula ?? "")),
    promos: body.promos !== false,
    intereses: Array.isArray(body.intereses)
      ? body.intereses.map((x) => String(x).trim().toLowerCase()).filter(Boolean)
      : [],
    origen: body.origen ? String(body.origen).slice(0, 40) : null,
  };

  const errores = validarRegistro(registro);
  if (errores.length) {
    return NextResponse.json({ error: errores[0] }, { status: 400 });
  }

  const credenciales = await credencialesWifi();
  if (!credenciales) {
    return NextResponse.json(
      {
        error:
          "El WiFi todavía no está configurado. Avísale al equipo de la Quinta.",
      },
      { status: 503 },
    );
  }

  // La función es SECURITY DEFINER y está habilitada para visitantes sin
  // sesión, así que basta el cliente normal (rol anon).
  const sb = createServiceClient() ?? (await createSupabaseServerClient());
  const { data, error } = await sb.rpc("wifi_registrar", {
    p_nombre: registro.nombre,
    p_email: registro.email,
    p_telefono: normalizarTelefono(registro.telefono),
    p_cedula: registro.cedula,
    p_promos: registro.promos,
    p_interes: registro.intereses.join(","),
    p_origen: registro.origen,
  });

  if (error) {
    console.error("[wifi] error registrando invitado:", error.message);
    return NextResponse.json(
      { error: "No pudimos guardar tus datos. Inténtalo de nuevo." },
      { status: 500 },
    );
  }

  const fila = Array.isArray(data) ? data[0] : data;
  const res = NextResponse.json({
    ...credenciales,
    nuevo: fila?.nuevo ?? true,
    visitas: fila?.visitas ?? 1,
    nombre: registro.nombre,
  });
  res.cookies.set(COOKIE_WIFI, registro.email, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DIAS_COOKIE * 24 * 60 * 60,
  });
  return res;
}
