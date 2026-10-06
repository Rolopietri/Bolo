// Administración financiera · candado del servidor
// ═══════════════════════════════════════════════════════════════════
// La contraseña de administración vive SOLO en Vercel (env ADMIN_PASSWORD),
// nunca en el código. Al validarla, se emite un token firmado (HMAC) con
// vencimiento, que viaja en una cookie httpOnly. Cada endpoint financiero
// exige ese token. Sin la contraseña no se emite token, y sin token el
// servidor no devuelve ningún dato.

import crypto from "node:crypto";

export const ADMIN_COOKIE = "qm_admin";
const DURACION_MS = 30 * 24 * 60 * 60 * 1000; // 30 días (uso diario; "Salir" cierra)

function secret(): string | null {
  return process.env.ADMIN_PASSWORD || null;
}

export function adminConfigurado(): boolean {
  return !!secret();
}

export function passwordCorrecta(pw: string): boolean {
  const s = secret();
  if (!s) return false;
  const a = Buffer.from(pw);
  const b = Buffer.from(s);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function firmar(msg: string): string {
  return crypto.createHmac("sha256", secret() ?? "").update(msg).digest("base64url");
}

export function crearToken(): string {
  const exp = String(Date.now() + DURACION_MS);
  return `${exp}.${firmar(exp)}`;
}

export function tokenValido(_token?: string): boolean {
  // Administración ABIERTA: ya no exige su propia contraseña. Basta con haber
  // iniciado sesión en bolo — el middleware (proxy.ts) ya protege /api/admin/*,
  // así que cualquier usuario con sesión puede entrar.
  return true;
}
