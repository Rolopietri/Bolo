// Destinos que el asistente puede "mostrar" en pantalla con el cursor-guía.
// La ruta del asistente usa las CLAVES como enum de la herramienta
// `mostrar_en_pantalla`; el cursor-guía (_GuiaCursor) usa el resto para
// navegar, colocar la guía de inicio en el paso correcto y apuntar al elemento.
//
// `preparar` abre el formulario o la pestaña real antes de señalar, para no
// quedarse en el botón del inicio. Los selectores apuntan a `data-guia="..."`.
import type { PrepararPantalla } from "./_guiaAccion";

export type Destino = {
  /** Ruta donde vive el elemento. */
  ruta: string;
  /** Query sin "?", por ejemplo "vista=alertas". */
  consulta?: string;
  /** Paso de la guía de inicio a activar antes de apuntar (0–3), si aplica. */
  paso?: number;
  /** Qué debe abrir la pantalla antes de que el cursor señale. */
  preparar?: PrepararPantalla;
  /** Selector del elemento a señalar. */
  selector: string;
  /** Texto corto de lo que se va a mostrar (para el botón "Te muestro"). */
  etiqueta: string;
};

const DESTINOS_BASE = {
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
  // ── Cocina: botones y pasos del montaje (guía de inicio) ───────────
  empezar: {
    ruta: "/cocina",
    selector: '[data-guia="cocina-empezar"]',
    etiqueta: "por dónde empezar a montar tu cocina",
  },
  proveedores: {
    ruta: "/cocina",
    selector: '[data-guia="paso-proveedores"]',
    etiqueta: "el paso de proveedores",
  },
  insumos: {
    ruta: "/cocina",
    selector: '[data-guia="paso-insumos"]',
    etiqueta: "el paso de insumos",
  },
  recetas: {
    ruta: "/cocina",
    selector: '[data-guia="paso-recetas"]',
    etiqueta: "el paso de recetas",
  },
  compras: {
    ruta: "/cocina",
    selector: '[data-guia="paso-compras"]',
    etiqueta: "el paso de compras",
  },
  plato: {
    ruta: "/cocina",
    selector: '[data-guia="guia-plato"]',
    etiqueta: "cómo crear un plato y ver su costo",
  },
  // ── Formularios y pantallas reales ──────────────────────────────────
  form_proveedor: {
    ruta: "/cocina/proveedores",
    preparar: "form-proveedor",
    selector: '[data-guia="form-proveedor"]',
    etiqueta: "el formulario para crear un proveedor",
  },
  form_insumo: {
    ruta: "/cocina/insumos",
    preparar: "form-insumo",
    selector: '[data-guia="form-insumo"]',
    etiqueta: "el formulario para cargar un insumo",
  },
  form_receta: {
    ruta: "/cocina/recetas/nuevo",
    preparar: "form-receta",
    selector: '[data-guia="campo-receta-nombre"]',
    etiqueta: "el formulario de una receta nueva",
  },
  form_compra: {
    ruta: "/cocina/compras",
    preparar: "form-compra",
    selector: '[data-guia="form-compra"]',
    etiqueta: "el formulario para registrar una compra",
  },
  alertas: {
    ruta: "/cocina/insumos",
    consulta: "vista=alertas",
    preparar: "tab-alertas",
    selector: '[data-guia="alertas-resumen"]',
    etiqueta: "tus alertas de stock",
  },
  stock: {
    ruta: "/cocina/insumos",
    preparar: "buscar-insumo",
    selector: '[data-guia="buscar-insumo"]',
    etiqueta: "el buscador de insumos y su stock",
  },
  unidades: {
    ruta: "/cocina/insumos",
    preparar: "calculadora",
    selector: '[data-guia="calculadora-unidades"]',
    etiqueta: "la calculadora de gramos y kilos",
  },
  pedido: {
    ruta: "/cocina/pedido",
    selector: '[data-guia="pedido-raciones"]',
    etiqueta: "dónde armas el pedido sugerido",
  },
} satisfies Record<string, Destino>;

// El valor se ve como Destino (con `preparar` y `consulta` opcionales) para
// que se puedan leer aunque no estén en todos los destinos.
export const DESTINOS: Record<keyof typeof DESTINOS_BASE, Destino> = DESTINOS_BASE;

export type ClaveDestino = keyof typeof DESTINOS;

export const CLAVES_DESTINO = Object.keys(DESTINOS) as ClaveDestino[];

/** Evento global que dispara el guía visual. */
export const EVENTO_GUIAR = "bolo:guiar";
/** Evento global para que la guía de inicio salte a un paso. */
export const EVENTO_IR_PASO = "bolo:ir-paso";
/** Evento global para abrir la burbujita del asistente desde otro lugar. */
export const EVENTO_ABRIR = "bolo:abrir-asistente";
