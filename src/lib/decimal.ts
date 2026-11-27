// Campos de números decimales que funcionan con el teclado en español,
// y la presentación de lo que ve la persona: siempre dos decimales.
//
// Los <input type="number"> rechazan la coma en muchos teléfonos (escribes
// "11,895" y el campo queda vacío o se come la coma). Por eso los campos de
// cantidades y montos son de texto con teclado decimal (inputMode="decimal") y
// lo escrito pasa por aquí: se acepta coma o punto y se guarda con punto, que
// es lo que entiende Number().
//
// Lo que se muestra (precios, cantidades, tasas, mermas, porcentajes) lleva
// exactamente dos decimales. Los cálculos y lo que se guarda en la base no se
// recortan: solo cambia la presentación y, en los inputs, el paso 0,01.

/** Decimales que ve la persona. No es la precisión de cálculo ni de guardado. */
export const DECIMALES_VISIBLE = 2;

/** `step` de los inputs decimales (precios, cantidades, tasas, porcentajes). */
export const STEP_DECIMAL = "0.01";

export type LocaleNumero = "es-VE" | "en-US";

const OPCIONES: Intl.NumberFormatOptions = {
  minimumFractionDigits: DECIMALES_VISIBLE,
  maximumFractionDigits: DECIMALES_VISIBLE,
};

/** Limpia lo que se escribe en un campo decimal. Coma o punto sirven de
 *  decimal; si aparecen varios (ej. "73.395,12"), el último es el decimal y
 *  los demás eran separadores de miles. */
export function limpiarDecimal(valor: string): string {
  const s = valor.replace(/[^\d.,]/g, "");
  const ultimo = Math.max(s.lastIndexOf(","), s.lastIndexOf("."));
  if (ultimo < 0) return s;
  return s.slice(0, ultimo).replace(/[.,]/g, "") + "." + s.slice(ultimo + 1).replace(/[.,]/g, "");
}

/** Número con exactamente dos decimales. Por defecto, coma decimal (es-VE).
 *  Los dólares siguen usando `fmtUsd` (punto, en-US). */
export function fmtDec(
  n: number | null | undefined,
  locale: LocaleNumero = "es-VE",
): string {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return v.toLocaleString(locale, OPCIONES);
}

/** Porcentaje con exactamente dos decimales y el signo %. */
export function fmtPorc(
  n: number | null | undefined,
  locale: LocaleNumero = "es-VE",
): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${fmtDec(n, locale)}%`;
}

/**
 * Para rellenar un input: dos decimales con punto, que es lo que entiende
 * `type="number"`. Vacío si no hay valor. El campo lo puede volver a leer
 * Number() o limpiarDecimal().
 */
export function textoInputDecimal(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "";
  return n.toFixed(DECIMALES_VISIBLE);
}

/** Piezas que se cuentan (unidades, platos, raciones). Si el número es entero,
 *  se muestra sin decimales; si no, con dos. Pesos, volúmenes y dinero siempre
 *  llevan dos decimales: usar fmtDec o displayCantidad. */
const UNIDAD_ENTERA =
  /^(unid|ud|u|unidad|unidades|plato|platos|ración|raciones|racion)$/i;

export function esUnidadEntera(unidad?: string | null): boolean {
  return UNIDAD_ENTERA.test((unidad ?? "").trim());
}

export function fmtCantidad(
  n: number | null | undefined,
  unidad?: string | null,
  locale: LocaleNumero = "es-VE",
): string {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  if (esUnidadEntera(unidad) && Number.isInteger(Number(v.toFixed(DECIMALES_VISIBLE)))) {
    return Math.round(v).toLocaleString(locale);
  }
  return fmtDec(v, locale);
}
