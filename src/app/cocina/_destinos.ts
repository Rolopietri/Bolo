// Destinos que el asistente puede "mostrar" en pantalla con el cursor-guía.
// La ruta del asistente usa las CLAVES como enum de la herramienta
// `mostrar_en_pantalla`; el cursor-guía (_GuiaCursor) usa el resto para
// navegar, colocar la guía de inicio en el paso correcto y apuntar al elemento.
//
// Los selectores apuntan a elementos marcados con `data-guia="..."` que viven
// en páginas que controlamos (la portada de Cocina y su guía de inicio).

export type Destino = {
  /** Ruta donde vive el elemento. */
  ruta: string;
  /** Paso de la guía de inicio a activar antes de apuntar (0–3), si aplica. */
  paso?: number;
  /** Selector del elemento a señalar. */
  selector: string;
  /** Texto corto de lo que se va a mostrar (para el botón "Te muestro"). */
  etiqueta: string;
};

export const DESTINOS = {
  // ── Módulos de la plataforma (se señalan en su tarjeta del inicio) ──
  inicio_cocina: {
    ruta: "/",
    selector: '[data-guia="mod-cocina"]',
    etiqueta: "dónde está el módulo de Cocina",
  },
  inicio_administracion: {
    ruta: "/",
    selector: '[data-guia="mod-administracion"]',
    etiqueta: "dónde está Administración (cuentas y dinero)",
  },
  inicio_marketplace: {
    ruta: "/",
    selector: '[data-guia="mod-marketplace"]',
    etiqueta: "dónde está el Mercado (proveedores y equipos)",
  },
  // ── Pasos del montaje de Cocina ─────────────────────────────────────
  proveedores: {
    ruta: "/cocina",
    paso: 0,
    selector: '[data-guia="guia-cta"]',
    etiqueta: "dónde agregar tus proveedores",
  },
  insumos: {
    ruta: "/cocina",
    paso: 1,
    selector: '[data-guia="guia-cta"]',
    etiqueta: "dónde cargar tus insumos",
  },
  recetas: {
    ruta: "/cocina",
    paso: 2,
    selector: '[data-guia="guia-cta"]',
    etiqueta: "dónde crear tus recetas",
  },
  compras: {
    ruta: "/cocina",
    paso: 3,
    selector: '[data-guia="guia-cta"]',
    etiqueta: "dónde registrar tus compras",
  },
  plato: {
    ruta: "/cocina",
    selector: '[data-guia="guia-plato"]',
    etiqueta: "cómo crear un plato y ver su costo",
  },
} satisfies Record<string, Destino>;

export type ClaveDestino = keyof typeof DESTINOS;

export const CLAVES_DESTINO = Object.keys(DESTINOS) as ClaveDestino[];

/** Evento global que dispara el guía visual. */
export const EVENTO_GUIAR = "bolo:guiar";
/** Evento global para que la guía de inicio salte a un paso. */
export const EVENTO_IR_PASO = "bolo:ir-paso";
/** Evento global para abrir la burbujita del asistente desde otro lugar. */
export const EVENTO_ABRIR = "bolo:abrir-asistente";
