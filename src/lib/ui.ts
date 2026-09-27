// Helpers de UI compartidos entre pantallas.

/**
 * Clase para las "pills" de filtro (secciones, categorías, orden…) que se usan
 * en varias pantallas de cocina. `active` marca la pill seleccionada.
 */
export function pillClass(active: boolean): string {
  return `px-3 py-1 rounded-full text-[11px] uppercase tracking-widest ring-1 transition-colors ${
    active
      ? "bg-cacao text-white ring-cacao"
      : "bg-white text-cacao-soft ring-marfil hover:bg-marfil-soft"
  }`;
}

/** Fecha de hoy en ISO corto (YYYY-MM-DD), para inputs date y defaults. */
export function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}
