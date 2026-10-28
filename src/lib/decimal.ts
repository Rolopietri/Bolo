// Campos de números decimales que funcionan con el teclado en español.
//
// Los <input type="number"> rechazan la coma en muchos teléfonos (escribes
// "11,895" y el campo queda vacío o se come la coma). Por eso los campos de
// cantidades y montos son de texto con teclado decimal (inputMode="decimal") y
// lo escrito pasa por aquí: se acepta coma o punto y se guarda con punto, que
// es lo que entiende Number().

/** Limpia lo que se escribe en un campo decimal. Coma o punto sirven de
 *  decimal; si aparecen varios (ej. "73.395,12"), el último es el decimal y
 *  los demás eran separadores de miles. */
export function limpiarDecimal(valor: string): string {
  const s = valor.replace(/[^\d.,]/g, "");
  const ultimo = Math.max(s.lastIndexOf(","), s.lastIndexOf("."));
  if (ultimo < 0) return s;
  return s.slice(0, ultimo).replace(/[.,]/g, "") + "." + s.slice(ultimo + 1).replace(/[.,]/g, "");
}
