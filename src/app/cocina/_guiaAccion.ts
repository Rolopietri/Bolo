// Lo que el cursor-guía le pide a la pantalla antes de señalar: abrir el
// formulario real, cambiar de pestaña o dejar un texto en el buscador.
// Vive en memoria un rato corto para que la página nueva lo lea al montar
// (el evento puede haber ocurrido antes de que existiera).

export const EVENTO_PREPARAR = "bolo:preparar";

export type RellenoGuia = {
  nombre?: string;
  contacto?: string;
  telefono?: string;
  correo?: string;
  unidad?: string;
  precio?: string;
  notas?: string;
  /** Texto para el buscador de insumos. */
  consulta?: string;
};

export type PrepararPantalla =
  | "form-proveedor"
  | "form-insumo"
  | "form-receta"
  | "form-compra"
  | "tab-alertas"
  | "tab-catalogo"
  | "buscar-insumo"
  | "calculadora";

export type GuiaPendiente = {
  preparar?: PrepararPantalla;
  relleno?: RellenoGuia;
};

const VIDA_MS = 8000;

let pendiente: GuiaPendiente | null = null;
let vence = 0;

export function publicarGuia(p: GuiaPendiente | null) {
  pendiente = p;
  vence = Date.now() + VIDA_MS;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVENTO_PREPARAR, { detail: p }));
  }
}

export function leerGuia(): GuiaPendiente | null {
  if (!pendiente) return null;
  if (Date.now() > vence) {
    pendiente = null;
    return null;
  }
  return pendiente;
}
