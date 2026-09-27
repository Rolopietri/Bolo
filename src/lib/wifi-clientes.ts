// Base de clientes · alimenta `wifi_invitados` desde otras fuentes (por ahora,
// el "Reporte Detallado por Factura" del cafetín/Xetux). Solo servidor.
//
// Regla: un cliente es la misma persona si coincide la cédula; si no hay
// cédula, si coincide el correo; y si tampoco, si coincide el nombre exacto
// (sin acentos ni mayúsculas). Nunca se duplica: la función SQL
// `wifi_fusionar_cliente` hace el merge y suma la visita solo si la fecha de
// compra es posterior a la última registrada.
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizarCedula, cedulaValida, normalizarTelefono, emailValido } from "@/lib/wifi";

type FilaCliente = { cliente: string; cedula: string; telefono: string; email: string; fecha: string };

const GENERICOS = new Set([
  "", "-", "--", "—", "consumidor final", "consumidor", "cliente", "clientes", "contado", "publico", "público",
  "general", "varios", "mesa", "sin nombre", "n/a", "na", "caja", "mostrador", "barra", "delivery", "pickup",
]);

const clave = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().replace(/\s+/g, " ");

/** ¿El nombre parece una persona real y no un comodín del POS? */
export function nombreUtil(nombre: string): boolean {
  const k = clave(nombre);
  if (GENERICOS.has(k)) return false;
  if (k.length < 3) return false;
  if (/^\d+$/.test(k)) return false; // solo números (número de mesa, etc.)
  if (/^(mesa|orden|ticket|cta|cuenta)\s*\d+$/.test(k)) return false;
  return true;
}

/** Mayúsculas iniciales: "MARIA PEREZ" → "Maria Perez". */
function bonito(nombre: string): string {
  return nombre.trim().replace(/\s+/g, " ").toLowerCase().replace(/(^|\s|-)([a-záéíóúñ])/g, (m) => m.toUpperCase());
}

export type ResultadoSync = { nuevos: number; actualizados: number; ignorados: number };

/**
 * Deduplica las filas del reporte (una persona por cédula / correo / nombre,
 * con la ÚLTIMA fecha de compra) y las fusiona en `wifi_invitados`.
 */
export async function sincronizarClientesDesdeFacturas(
  sb: SupabaseClient,
  filas: FilaCliente[],
  origen = "cafetin",
): Promise<ResultadoSync> {
  const res: ResultadoSync = { nuevos: 0, actualizados: 0, ignorados: 0 };
  const personas = new Map<string, { nombre: string; cedula: string | null; telefono: string | null; email: string | null; fecha: string }>();

  for (const f of filas) {
    const nombre = (f.cliente || "").trim();
    const cedula = f.cedula && cedulaValida(f.cedula) ? normalizarCedula(f.cedula) : null;
    const email = f.email && emailValido(f.email) ? f.email.trim().toLowerCase() : null;
    const telefono = f.telefono && normalizarTelefono(f.telefono).replace(/\D/g, "").length >= 7 ? normalizarTelefono(f.telefono) : null;
    if (!cedula && !email && !nombreUtil(nombre)) { res.ignorados++; continue; }
    const k = cedula ? `c:${cedula}` : email ? `e:${email}` : `n:${clave(nombre)}`;
    const prev = personas.get(k);
    if (!prev) personas.set(k, { nombre: nombreUtil(nombre) ? bonito(nombre) : "", cedula, telefono, email, fecha: f.fecha });
    else {
      if (f.fecha > prev.fecha) prev.fecha = f.fecha;
      if (!prev.nombre && nombreUtil(nombre)) prev.nombre = bonito(nombre);
      prev.telefono ??= telefono;
      prev.email ??= email;
    }
  }

  for (const p of personas.values()) {
    const { data, error } = await sb.rpc("wifi_fusionar_cliente", {
      p_nombre: p.nombre || null,
      p_cedula: p.cedula,
      p_telefono: p.telefono,
      p_email: p.email,
      p_fecha: p.fecha,
      p_origen: origen,
    });
    if (error) { console.error("[clientes] no pude fusionar:", p, error.message); res.ignorados++; continue; }
    const fila = Array.isArray(data) ? data[0] : data;
    if (fila?.nuevo) res.nuevos++; else res.actualizados++;
  }
  return res;
}
