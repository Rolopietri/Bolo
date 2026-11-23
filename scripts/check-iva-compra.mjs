// Costo del insumo según si el negocio recupera el IVA de las compras.
// Caso de QA: queso blanco duro, 1,437 kg, IVA 16 % aparte, tasa 287,4613.
//   sin IVA → $7,64/kg    con IVA → $8,86/kg

import {
  desgloseIva,
  precioPorKg,
  fiscalAlGuardar,
  modoIvaDeCompra,
  modoIvaDeFactura,
  filaCompra,
  esColumnaAusente,
} from "../src/lib/iva-compra.ts";
import { parseFactura } from "../src/lib/facturas/parser.ts";

let fallas = 0;
function igual(nombre, real, esperado) {
  const ok =
    typeof esperado === "number"
      ? typeof real === "number" && Math.abs(real - esperado) < 0.005
      : real === esperado;
  if (!ok) {
    fallas++;
    console.error(`✕ ${nombre}: salió ${JSON.stringify(real)}, se esperaba ${JSON.stringify(esperado)}`);
  }
}

const tasa = 287.4613;
const kg = 1.437;
const baseBs = 3155.72; // 1,437 kg × 2.196,05 Bs
const montoUsd = baseBs / tasa;
const redondeado = (n) => Math.round(n * 100) / 100;

const si = desgloseIva({
  monto: montoUsd,
  ivaModo: "sin",
  exento: false,
  ivaPorc: 16,
  recuperaIva: true,
});
const no = desgloseIva({
  monto: montoUsd,
  ivaModo: "sin",
  exento: false,
  ivaPorc: 16,
  recuperaIva: false,
});

igual("queso recupera: base es el monto", si.base, montoUsd);
igual("queso recupera: IVA 16%", si.iva, montoUsd * 0.16);
igual("queso recupera: exento 0", si.exento, 0);
igual("queso recupera: pagado = base + IVA", si.pagado, si.base + si.iva);
igual("queso recupera: costo = base (sin IVA)", si.costo, si.base);
igual("queso recupera: $7,64/kg", redondeado(precioPorKg(si.costo, kg)), 7.64);

igual("queso no recupera: misma base", no.base, si.base);
igual("queso no recupera: mismo IVA", no.iva, si.iva);
igual("queso no recupera: mismo exento", no.exento, 0);
igual("queso no recupera: costo = lo pagado (con IVA)", no.costo, no.pagado);
igual("queso no recupera: $8,86/kg", redondeado(precioPorKg(no.costo, kg)), 8.86);

// Lo exento no cambia con el ajuste.
const exento = 14792.17 / tasa;
const exSi = desgloseIva({ monto: exento, ivaModo: "sin", exento: true, ivaPorc: 16, recuperaIva: true });
const exNo = desgloseIva({ monto: exento, ivaModo: "sin", exento: true, ivaPorc: 16, recuperaIva: false });
igual("exento: todo es exento", exSi.exento, exento);
igual("exento: sin IVA", exSi.iva, 0);
igual("exento: el costo no cambia", exSi.costo, exNo.costo);

// Monto que ya trae el IVA: se separa la base.
const conIva = desgloseIva({
  monto: no.pagado,
  ivaModo: "con",
  exento: false,
  ivaPorc: 16,
  recuperaIva: true,
});
igual("monto con IVA: la base cuadra", Math.abs(conIva.base - si.base) < 0.0001, true);
igual("monto con IVA: el costo sin IVA cuadra", Math.abs(conIva.costo - si.costo) < 0.0001, true);

// Un lomito de $10 sin IVA no se parte, aunque el ajuste sea "sí recupero".
const lomito = desgloseIva({ monto: 10, ivaModo: "exento", exento: false, ivaPorc: 16, recuperaIva: true });
igual("lomito exento queda en 10", lomito.costo, 10);
igual("lomito exento no tiene IVA", lomito.iva, 0);
const lomitoMal = desgloseIva({ monto: 10, ivaModo: "con", exento: false, ivaPorc: 16, recuperaIva: true });
igual("tratarlo como con IVA lo deja en 8,62", Math.round(lomitoMal.costo * 100) / 100, 8.62);

// Nota de entrega / ticket sin IVA aparte: la cebolla de f2.
const cebollaUsd = 4.54;
const cebollaKg = 3.178;
const cebolla = desgloseIva({ monto: cebollaUsd, ivaModo: "exento", exento: false, ivaPorc: 16, recuperaIva: true });
igual("cebolla sin IVA en la factura", Math.round(precioPorKg(cebolla.costo, cebollaKg) * 10000) / 10000, 1.4286);
const cebollaMal = desgloseIva({ monto: cebollaUsd, ivaModo: "con", exento: false, ivaPorc: 16, recuperaIva: true });
igual("cebolla si se le restara IVA", Math.round(precioPorKg(cebollaMal.costo, cebollaKg) * 10000) / 10000, 1.2315);

const f2 = parseFactura(`
QA VERDURAS EL VALLE
RIF: J-40987654-1
NOTA DE ENTREGA N° 3391
3,178 KG CEBOLLA BLANCA 1,43 4,54
TOTAL $ 4,54
`);
igual("nota de entrega no trae IVA", modoIvaDeFactura(f2), "exento");
const f1 = parseFactura(`
RIF: J-41258963-7
FACTURA
IVA G 16% Bs 504,92
BASE IMPONIBLE G 16% Bs 3.155,72
`);
igual("factura con IVA aparte", modoIvaDeFactura(f1), "sin");

// Editar no reescribe el costo guardado.
const editado = fiscalAlGuardar({
  recalculado: lomitoMal,
  original: { baseUsd: 0, ivaUsd: 0, exentoUsd: 10, costoUsd: 10, precioTotalUsd: 10 },
  intacto: true,
});
igual("editar conserva el exento", editado.exentoUsd, 10);
igual("editar conserva el costo", editado.costoUsd, 10);
igual("editar no inventa IVA", editado.ivaUsd, 0);
const vieja = fiscalAlGuardar({
  recalculado: lomitoMal,
  original: { precioTotalUsd: 10 },
  intacto: true,
});
igual("compra vieja sigue en 10", vieja.costoUsd, 10);
igual("compra vieja se anota como exento", vieja.exentoUsd, 10);
igual("modo de una compra vieja", modoIvaDeCompra({}), "exento");
const cambiada = fiscalAlGuardar({
  recalculado: lomito,
  original: { baseUsd: 0, ivaUsd: 0, exentoUsd: 10, costoUsd: 10, precioTotalUsd: 10 },
  intacto: false,
});
igual("si cambió el monto, el costo lo recalcula la base", cambiada.costoUsd, null);
igual("si cambió el monto, usa el desglose nuevo", cambiada.exentoUsd, 10);

// Sin las columnas nuevas, la fila no las nombra.
const sinCols = filaCompra(
  { insumoId: "x", fecha: "2026-11-21", cantidad: 1, precioTotalUsd: 10, baseUsd: 0, ivaUsd: 0, exentoUsd: 10, costoUsd: 10 },
  false,
);
igual("sin SQL no va base_usd", sinCols.base_usd, undefined);
igual("sin SQL no va costo_usd", sinCols.costo_usd, undefined);
igual("sin SQL sí va el total", sinCols.precio_total_usd, 10);
const conCols = filaCompra(
  { insumoId: "x", fecha: "2026-11-21", cantidad: 1, precioTotalUsd: 10, baseUsd: 0, ivaUsd: 0, exentoUsd: 10, costoUsd: 10 },
  true,
);
igual("con SQL va el costo congelado", conCols.costo_usd, 10);
igual("con SQL va el exento", conCols.exento_usd, 10);
igual(
  "detecta columna ausente",
  esColumnaAusente({ code: "PGRST204", message: "Could not find the 'base_usd' column of 'compras' in the schema cache" }),
  true,
);
igual("otro error no es una columna", esColumnaAusente({ code: "23502", message: "null value in column" }), false);

if (fallas > 0) {
  console.error(`\n${fallas} prueba(s) del IVA de compras fallaron.`);
  process.exit(1);
}
console.log("✓ IVA de compras: todas las pruebas pasan.");
