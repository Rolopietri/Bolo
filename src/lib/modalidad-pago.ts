import type { ModalidadPago } from "@/lib/types";

// La forma de pago la elige la persona. Muchos proveedores quedaron marcados
// solo con "USD efectivo" (es el valor por defecto al crearlos). Elegirlos no
// debe cambiar "USD divisa" a "USD efectivo", ni una factura en Bs a dólares.
// `acepta` y `moneda` se conservan en la firma para no romper a quien llama.

/** Forma de pago al elegir un proveedor: se queda la que ya está elegida.
 *  Ni la lista del proveedor ni la moneda de la factura la cambian. */
export function modalidadAlElegirProveedor(
  actual: ModalidadPago,
  acepta: ModalidadPago[],
  moneda: "bs" | "usd" | null,
): ModalidadPago {
  void acepta;
  void moneda;
  return actual;
}
