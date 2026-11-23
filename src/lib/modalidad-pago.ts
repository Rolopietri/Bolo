import type { ModalidadPago } from "@/lib/types";

// La forma de pago no se cambia de moneda sola. Muchos proveedores quedaron
// marcados solo con "USD efectivo" (es el valor por defecto al crearlos) y no
// tienen ninguna forma en Bs. Una factura en bolívares, o una compra que ya
// iba en Bs, no debe saltar a USD efectivo por eso.

const EN_BS: ModalidadPago[] = ["bcv_dolar", "bcv_euro", "paralela"];
const EN_USD: ModalidadPago[] = ["efectivo", "divisa"];

function esBs(m: ModalidadPago): boolean {
  return EN_BS.includes(m);
}

/** Forma de pago al elegir un proveedor.
 *
 *  - Si el proveedor acepta la actual, se queda.
 *  - Si no marcó ninguna, se queda (los datos están incompletos).
 *  - Si marcó otra de la MISMA moneda, se usa esa.
 *  - Si la factura (o la forma ya elegida) es en Bs y el proveedor no tiene
 *    ninguna en Bs, se conserva la de Bs. No se pasa a USD efectivo.
 *
 *  `moneda` es la de la factura cuando se conoce (el escaneo). En el formulario
 *  manual es null y manda la forma que ya está elegida.
 */
export function modalidadAlElegirProveedor(
  actual: ModalidadPago,
  acepta: ModalidadPago[],
  moneda: "bs" | "usd" | null,
): ModalidadPago {
  if (acepta.length === 0 || acepta.includes(actual)) return actual;
  const enBolivares = moneda === "bs" || (moneda == null && esBs(actual));
  const familia = enBolivares ? EN_BS : EN_USD;
  return acepta.find((m) => familia.includes(m)) ?? actual;
}
