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
  // ── Cocina: botones y pasos del montaje ─────────────────────────────
  empezar: {
    ruta: "/cocina",
    selector: '[data-guia="cocina-empezar"]',
    etiqueta: "por dónde empezar a montar tu cocina",
  },
  proveedores: {
    ruta: "/cocina",
    selector: '[data-guia="paso-proveedores"]',
    etiqueta: "dónde agregar tus proveedores",
  },
  insumos: {
    ruta: "/cocina",
    selector: '[data-guia="paso-insumos"]',
    etiqueta: "dónde cargar tus insumos",
  },
  recetas: {
    ruta: "/cocina",
    selector: '[data-guia="paso-recetas"]',
    etiqueta: "dónde crear tus recetas",
  },
  compras: {
    ruta: "/cocina",
    selector: '[data-guia="paso-compras"]',
    etiqueta: "dónde registrar tus compras",
  },
  plato: {
    ruta: "/cocina",
    selector: '[data-guia="guia-plato"]',
    etiqueta: "cómo crear un plato y ver su costo",
  },
  stock: {
    ruta: "/cocina",
    selector: '[data-guia="accion-stock"]',
    etiqueta: "dónde ver el stock, su valor y qué se acaba pronto",
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
