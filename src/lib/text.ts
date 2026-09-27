// Utilidades de texto para busquedas.

/**
 * Normaliza texto para busquedas: minusculas y SIN acentos/tildes/dieresis.
 * Asi "curcuma" encuentra "Curcuma", "cafe" encuentra "Cafe", etc.
 *
 * Se usa en TODOS los buscadores/filtros de la app: hay que aplicarla tanto a
 * lo que escribe el usuario como al texto contra el que se compara.
 */
export function normalizarBusqueda(s: string): string {
  // El rango \u0300-\u036f son las marcas diacriticas combinantes (las tildes
  // que NFD separa de la letra). Se escribe con codigo Unicode explicito, NO con
  // el caracter literal, porque el minificador del build puede corromperlo.
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Normaliza un nombre del catalogo (insumo / receta) al estandar de la casa:
 * MAYUSCULAS, sin tildes en las vocales, CONSERVANDO la N con virgulilla, y sin
 * espacios sobrantes ni dobles. Es la misma limpieza que se hizo por SQL, para
 * que los nombres nuevos entren estandarizados y parejos con Xetux.
 *
 * No se usa NFD aqui a proposito: NFD separaria tambien la tilde de la N con
 * virgulilla y la perderiamos; por eso se reemplazan solo las vocales acentuadas
 * de forma explicita (con codigo Unicode, que el minificador no corrompe).
 */
export function normalizarNombreCatalogo(nombre: string): string {
  // Vocales acentuadas mayusculas por CODIGO de caracter, para no depender de
  // literales acentuados en el fuente (que el minificador podria alterar).
  // La N con virgulilla (codigo 209) no esta en el mapa \u2192 se conserva tal cual.
  const acentos = new Map<number, string>([
    [193, "A"], // A con tilde
    [201, "E"], // E con tilde
    [205, "I"], // I con tilde
    [211, "O"], // O con tilde
    [218, "U"], // U con tilde
    [220, "U"], // U con dieresis
  ]);
  let out = "";
  for (const ch of nombre.trim().toUpperCase()) {
    out += acentos.get(ch.charCodeAt(0)) ?? ch;
  }
  return out.replace(/\s+/g, " ");
}
