// Costo del insumo según si el negocio recupera el IVA de las compras.
// Caso de QA: queso blanco duro, 1,437 kg, IVA 16 % aparte, tasa 287,4613.
//   sin IVA → $7,64/kg    con IVA → $8,86/kg

import { desgloseIva, precioPorKg } from "../src/lib/iva-compra.ts";

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

if (fallas > 0) {
  console.error(`\n${fallas} prueba(s) del IVA de compras fallaron.`);
  process.exit(1);
}
console.log("✓ IVA de compras: todas las pruebas pasan.");
