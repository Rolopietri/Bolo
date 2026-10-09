// Panel de operador · candado del servidor
// ═══════════════════════════════════════════════════════════════════
// La contraseña del operador vive SOLO en Vercel (env OPERADOR_PASSWORD),
// nunca en el código. Al validarla se emite un token firmado (HMAC) con
// vencimiento, en una cookie httpOnly. Cada endpoint del operador exige ese
// token. El operador modera el Mercado (ve denuncias, oculta/elimina anuncios),
// así que este candado protege datos privados y acciones destructivas.

import crypto from "node:crypto";

export const OPERADOR_COOKIE = "bolo_operador";
const DURACION_MS = 30 * 24 * 60 * 60 * 1000; // 30 días

function secret(): string | null {
  return process.env.OPERADOR_PASSWORD || null;
}

export function operadorConfigurado(): boolean {
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

export function tokenValido(token: string | undefined): boolean {
  if (!token || !secret()) return false;
  const i = token.indexOf(".");
  if (i < 0) return false;
  const exp = token.slice(0, i);
  const sig = token.slice(i + 1);
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum < Date.now()) return false;
  const esperado = firmar(exp);
  const a = Buffer.from(sig);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
