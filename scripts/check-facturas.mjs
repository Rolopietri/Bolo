// Pruebas del lector de facturas (src/lib/facturas/parser.ts).
// ─────────────────────────────────────────────────────────────────
// Corre las reglas sobre textos de facturas venezolanas típicos (como los
// devuelve el OCR) y falla (exit 1) si algún campo esperado no sale.
// Para agregar un caso real: pega el texto de la factura en CASOS con lo que
// debería leerse. Se corre con `npm run test:facturas` (Node 22+, sin
// dependencias: Node quita los tipos del .ts al importarlo).

import {
  parseFactura,
  parseNumero,
  normalizarDescripcion,
  sugerirInsumo,
} from "../src/lib/facturas/parser.ts";

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

// ── Números ──
igual("1.234,56", parseNumero("1.234,56"), 1234.56);
igual("1,234.56", parseNumero("1,234.56"), 1234.56);
igual("45,00", parseNumero("45,00"), 45);
igual("1.500", parseNumero("1.500"), 1500);
igual("12.50", parseNumero("12.50"), 12.5);
igual("0,500", parseNumero("0,500"), 0.5);
igual("Bs.1.200,00", parseNumero("Bs.1.200,00"), 1200);
igual("texto", parseNumero("HARINA"), null);

// ── Normalización (llave de la memoria) ──
igual("norm PAN", normalizarDescripcion("Harina P.A.N.  1 Kg"), "harina pan 1kg");
igual("norm acentos", normalizarDescripcion("AZÚCAR  Refinada"), "azucar refinada");

// ── Factura fiscal típica (montos en Bs, IVA aparte, un exento) ──
const f1 = parseFactura(`
DISTRIBUIDORA EL TRIGAL, C.A.
RIF: J-40123456-7
Av. Principal de Los Ruices, Caracas
FACTURA N° 00012345
N° DE CONTROL: 00-0045678
FECHA: 14/10/2026
RAZON SOCIAL: QUINTA MAMA RIF: J-50000000-1
CODIGO DESCRIPCION CANT PRECIO TOTAL
7591002000011 HARINA PAN 1KG 20 45,00 900,00
7590001112223 ACEITE VATEL 1LT 6 120,50 723,00
1003 AZUCAR REFINADA 1KG (E) 10 38,00 380,00
SUB-TOTAL Bs. 2.003,00
BASE IMPONIBLE 1.623,00
IVA 16% 259,68
TOTAL A PAGAR Bs. 2.262,68
`);
igual("f1 rif", f1.rif, "J-40123456-7");
igual("f1 proveedor", f1.proveedorNombre, "DISTRIBUIDORA EL TRIGAL, C.A.");
igual("f1 numero", f1.numero, "00012345");
igual("f1 fecha", f1.fecha, "2026-10-14");
igual("f1 moneda", f1.moneda, "bs");
igual("f1 iva%", f1.ivaPorc, 16);
igual("f1 iva", f1.iva, 259.68);
igual("f1 subtotal", f1.subtotal, 2003);
igual("f1 total", f1.total, 2262.68);
igual("f1 #lineas", f1.lineas.length, 3);
igual("f1 l1 desc", f1.lineas[0]?.descripcion, "HARINA PAN 1KG");
igual("f1 l1 cant", f1.lineas[0]?.cantidad, 20);
igual("f1 l1 total", f1.lineas[0]?.total, 900);
igual("f1 l2 cant", f1.lineas[1]?.cantidad, 6);
igual("f1 l2 precio", f1.lineas[1]?.precioUnit, 120.5);
igual("f1 l3 exento", f1.lineas[2]?.exento, true);
igual("f1 l1 exento", f1.lineas[0]?.exento, false);
igual("f1 l1 confianza", f1.lineas[0]?.confianza, "alta");
igual("baja confianza", parseFactura("RIF J-1234567-8\nCALLE 5 LOCAL NRO 12,50").lineas[0]?.confianza, "baja");

// ── Cantidad al inicio, montos en $ ──
const f2 = parseFactura(`
INVERSIONES LA GRANJA 2020
R.I.F. J-31234567-0
Factura: A-00987   Fecha 03-09-26
2 POLLO ENTERO KG 3,50 7,00
12 HUEVOS CARTON 30 UND 5,25 63,00
TOTAL $ 70,00
`);
igual("f2 rif", f2.rif, "J-31234567-0");
igual("f2 numero", f2.numero, "A-00987");
igual("f2 fecha", f2.fecha, "2026-09-03");
igual("f2 moneda", f2.moneda, "usd");
igual("f2 total", f2.total, 70);
igual("f2 #lineas", f2.lineas.length, 2);
igual("f2 l1 cant", f2.lineas[0]?.cantidad, 2);
igual("f2 l1 desc", f2.lineas[0]?.descripcion, "POLLO ENTERO KG");
igual("f2 l2 cant", f2.lineas[1]?.cantidad, 12);
igual("f2 l2 total", f2.lineas[1]?.total, 63);

// ── Errores típicos del OCR: "N°" leído como "N*" ──
igual("ocr N*", parseFactura("FACTURA N* 00012345").numero, "00012345");

// ── Sugerencia de insumo por nombre ──
const insumos = [
  { id: "a", nombre: "HARINA DE MAIZ" },
  { id: "b", nombre: "ACEITE VEGETAL" },
  { id: "c", nombre: "AZUCAR" },
];
igual("sug azucar", sugerirInsumo("AZUCAR REFINADA 1KG", insumos)?.id, "c");
igual("sug aceite", sugerirInsumo("ACEITE VATEL 1LT", insumos)?.id, "b");
igual("sug nada", sugerirInsumo("SERVILLETAS", insumos), null);

if (fallas > 0) {
  console.error(`\n${fallas} prueba(s) del lector de facturas fallaron.`);
  process.exit(1);
}
console.log("✓ Lector de facturas: todas las pruebas pasan.");
