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
  totalProductos,
  parecido,
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
igual("baja confianza", parseFactura("RIF J-1234567-8\nHIELO EN BOLSA 12,50").lineas[0]?.confianza, "baja");
igual("direccion no es producto", parseFactura("RIF J-1234567-8\nCALLE 5 LOCAL NRO 12,50").lineas.length, 0);

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

// ── Máquina fiscal: "cant x precio" arriba, alícuota (G)/(E), BI, IGTF ──
const f3 = parseFactura(`
INDUSTRIAS ALIMENTICIAS EL TORO C.A.
RIF J-59957472-8
CALLE 3 GALPON 12 ZONA INDUSTRIAL
FACTURA: 00013574
FECHA: 08-04-2026 HORA: 10:32
RIF/C.I.: J-50000000-1
10 x 5.000,00
CARNE MOLIDA (G) 50.000,00
2 X Bs 1.000,00
HUEVOS (E) 2.000,00
SUBTTL 52.000,00
EXENTO 2.000,00
BI G16,00% 50.000,00
IVA G16,00% 8.000,00
TOTAL 60.000,00
IGTF 3,00% 1.800,00
TOTAL A PAGAR 61.800,00
EFECTIVO 61.800,00
`);
igual("f3 rif", f3.rif, "J-59957472-8");
igual("f3 numero", f3.numero, "00013574");
igual("f3 fecha", f3.fecha, "2026-04-08");
igual("f3 #lineas", f3.lineas.length, 2);
igual("f3 l1 desc", f3.lineas[0]?.descripcion, "CARNE MOLIDA");
igual("f3 l1 cant", f3.lineas[0]?.cantidad, 10);
igual("f3 l1 total", f3.lineas[0]?.total, 50000);
igual("f3 l1 confianza", f3.lineas[0]?.confianza, "alta");
igual("f3 l2 cant", f3.lineas[1]?.cantidad, 2);
igual("f3 l2 exento", f3.lineas[1]?.exento, true);
igual("f3 subtotal", f3.subtotal, 52000);
igual("f3 base", f3.base, 50000);
igual("f3 iva%", f3.ivaPorc, 16);
igual("f3 iva", f3.iva, 8000);
igual("f3 exento", f3.exento, 2000);
igual("f3 igtf", f3.igtf, 1800);
igual("f3 total", f3.total, 61800);
igual("f3 a cuadrar", totalProductos(f3), 60000);

// ── Cantidades: con decimales = peso (kg); enteras = unidades ──
const f6 = parseFactura(`
EL TORO C.A.
RIF J-59957472-8
1,1895 x 61.700,00
CARNE DE RES (G) 73.392,22
1,250 X 4.000,00
POLLO (G) 5.000,00
10,000 x 5.000,00
CARNE MOLIDA (G) 50.000,00
2 X 1.000,00
HUEVOS (E) 2.000,00
`);
igual("f6 #lineas", f6.lineas.length, 4);
igual("f6 carne cant", f6.lineas[0]?.cantidad, 1.1895);
igual("f6 carne pesable", f6.lineas[0]?.pesable, true);
igual("f6 pollo cant (1,250 = 1,25)", f6.lineas[1]?.cantidad, 1.25);
igual("f6 molida 10,000 = 10 kg", f6.lineas[2]?.cantidad, 10);
igual("f6 molida pesable", f6.lineas[2]?.pesable, true);
igual("f6 huevos cant", f6.lineas[3]?.cantidad, 2);
igual("f6 huevos no pesable", f6.lineas[3]?.pesable, false);
igual("cant al inicio con decimales", parseFactura("RIF J-1234567-8\n0,750 QUESO BLANCO 6,00 4,50").lineas[0]?.cantidad, 0.75);

// ── Unidad escrita en la factura ──
const f7 = parseFactura(`
EL TORO C.A.
RIF J-59957472-8
1,1895 KG x 61.700,00
CARNE DE RES (G) 73.392,22
500 GR X 10,00
QUESO PARMESANO (G) 5.000,00
CREMA DE LECHE LT 2 3,50 7,00
HARINA PAN 1KG 20 45,00 900,00
`);
igual("f7 carne kg", f7.lineas[0]?.unidadLeida, "kg");
igual("f7 queso g", f7.lineas[1]?.unidadLeida, "g");
igual("f7 queso cant", f7.lineas[1]?.cantidad, 500);
igual("f7 crema L", f7.lineas[2]?.unidadLeida, "L");
igual("G suelta no es gramos", parseFactura("RIF J-1234567-8\n3 X 4,00\nPAN CANILLA G 12,00").lineas[0]?.unidadLeida, undefined);
igual("f7 harina sin unidad (1KG es presentación)", f7.lineas[3]?.unidadLeida, undefined);

// ── La coma de la cantidad mal leída por el OCR (tickets térmicos) ──
const coma = (q) => parseFactura(`EL TORO C.A.\nRIF J-59957472-8\n${q} x 6.170,25\nCARNE (E) 73.395,12\n`).lineas[0];
igual("coma bien", coma("11,895")?.cantidad, 11.895);
igual("coma leída como punto", coma("11.895")?.cantidad, 11.895);
igual("coma leída como espacio", coma("11 895")?.cantidad, 11.895);
igual("coma perdida", coma("11895")?.cantidad, 11.895);
igual("coma perdida es peso", coma("11895")?.pesable, true);
igual("coma perdida precio", coma("11895")?.precioUnit, 6170.25);
igual("precio sin coma", parseFactura("EL TORO C.A.\nRIF J-59957472-8\n11,895 x 617025\nCARNE (E) 73.395,12\n").lineas[0]?.precioUnit, 6170.25);
igual("1.000 unidades no se achica", parseFactura("RIF J-1234567-8\n1.000 x 2,50\nSERVILLETAS (G) 2.500,00").lineas[0]?.cantidad, 1000);
igual("inline coma perdida", parseFactura("RIF J-1234567-8\nCARNE 11895 6.170,25 73.395,12").lineas[0]?.cantidad, 11.895);

// ── Factura en tabla, precios en USD (Distribuidora Ervaigle / Polar) ──
// Texto real del OCR (filas reconstruidas), sin los datos del cliente.
const f8 = parseFactura(`
DISTRIBUIDORA ER
(VAIGLE, C.A.
J-002992158 ““ 048298
N* de Control 00 >
| Calle 5, Edif Capri 1V, Piso 2,A FORMA LIBRE
Caracas (Petare) Miranda, ZP Avila, SERIE C
1073/ Telf. (0424) 287.31.99
FACTURA
| Condición de pago: CREDITO FACTURA 4: 005865 ORO
Plazo de pago: 7 días sin DPP SERIE: [A
Vencimiento: 17/09/2026 EMISIÓN: 10/09/2026|12:36:18
Día de vencimiento: Jueves
[Penco a no — ercial MORE ¿Cani a Unidades tiros Mota O USD LA a e TT USDA
|| |1-| PEPSI ZERO LATI55x24U 0.355 8527 [1] 18,9741 | 16,00| 0.00 18,97
10 24 1
2.- , AGUA MINALBA 600ML x 24 UNID 30 72 0.600 “43.20, [1] | 17,3621 | 16,00 ' 0.00 52,09 |
3.- |PEPSI LIGHT LATA 355X24 UND | 10) 2 0.355 ; 8.52| [y 18,9741 16,00 0.00 18,97
CONDICIONES DE CRÉDITO: "Concepto Bs. ' USD; |
1.- El pago en Bs debe realizarlo tomando en cuenta el tipo de cambio BCV del día. Exento IVA 0,00 0,00 |
2.- Esta factura debe ser pagada antes o en su fecha de vencimiento. “Base imponible 74.521,17 | 90,03 ' |
3.- No aceptamos billetes deteriorados, rotos, falsos o defectuosos. “IVA 16% sobre:74.521,17 — 11.923,39. 14,40:
4.- Esta factura causará IGTF 3% en caso de ser pagada en divisas. Total neto más impuestos 86.444,56! 104,43
5.- Tipo de cambio BCV Bs. 827,7371 Res 10/09/2026 del BCV Total — _86.44456 104,43
a pagar |
Tipo de cambio BCV Bs. 827,7371 Según Res 10/09/2026 del BCV
Ñ Nombre del conductor [a] Placas Tipo de vehiculo RECIBO CONFORME
| Graficas Artisan, c.a. RIF: J-00310398-8 —
Telf.: 571 .94.24 | SENIAT 01/00898 del 12/06/2008 Hasta el N* 82 '00 FORMA LIBRE
| -, ESTE DOCUMENTO VA SIN ENMENDADURAS Hasta el N* 00 0a8700 | FECHA: 01/07/2026 |
`);
igual("f8 rif", f8.rif, "J-00299215-8");
igual("f8 numero (# leído como 4)", f8.numero, "005865");
igual("f8 fecha de emisión", f8.fecha, "2026-09-10");
igual("f8 moneda usd", f8.moneda, "usd");
igual("f8 tasa de la factura", f8.tasa, 827.7371);
igual("f8 #lineas", f8.lineas.length, 3);
igual("f8 l1 desc", f8.lineas[0]?.descripcion, "PEPSI ZERO LATI55x24U");
igual("f8 l1 cant", f8.lineas[0]?.cantidad, 1);
igual("f8 l1 precio", f8.lineas[0]?.precioUnit, 18.9741);
igual("f8 l1 total", f8.lineas[0]?.total, 18.97);
igual("f8 l2 desc", f8.lineas[1]?.descripcion, "AGUA MINALBA 600ML x 24 UNID");
igual("f8 l2 cant (3 CJ leído como 30)", f8.lineas[1]?.cantidad, 3);
igual("f8 l2 total", f8.lineas[1]?.total, 52.09);
igual("f8 l3 cant", f8.lineas[2]?.cantidad, 1);
igual("f8 l3 total", f8.lineas[2]?.total, 18.97);
igual("f8 base", f8.base, 90.03);
igual("f8 iva", f8.iva, 14.4);
igual("f8 iva%", f8.ivaPorc, 16);
igual("f8 exento", f8.exento, 0);
igual("f8 igtf (la fila con IGTF es otra columna)", f8.igtf, undefined);
igual("f8 total", f8.total, 104.43);

// La misma factura en otra lectura del OCR: la fila de la Pepsi Light perdió
// todas las comas ("189741", "1897)") y el resto está bien.
const f9 = parseFactura(`
DISTRIBUIDORA ERVAIGLE, C.A.
J-002992158
[1] PEPSI ZERO LAT355x24U 10 2 0.355. 8521 [1] | 18,9741 | 16,00' “0.00 18,97.
2 AGUAMINALBA 600ML x 24 UNID 30) 72 0.600 43.20, [1] | 17,3621 | 16,00 ' 0.00 52,09
| | 3. | PEPSI UGHT LATA 35524 UND 10 2 0.355 ; 8.52| o 189741 | 1600 0.00 1897)
CONDICIONES DE CRÉDITO: "Concepto Bs. ' USD | |
1.- El pago en Bs debe realizarlo tomando en cuenta el tipo de cambio BCV del día. Exento IVA 0,00 0,00 |
2.- Esta factura debe ser pagada antes o en su fecha de vencimiento. “Base imponible 74.521,17 | 90,03 ' |
`);
igual("f9 #lineas", f9.lineas.length, 3);
igual("f9 l3 desc", f9.lineas[2]?.descripcion, "PEPSI UGHT LATA 35524 UND");
igual("f9 l3 total (1897 → 18,97)", f9.lineas[2]?.total, 18.97);
igual("f9 l3 cant", f9.lineas[2]?.cantidad, 1);
igual("f9 l3 precio", f9.lineas[2]?.precioUnit, 18.9741);
igual("f9 moneda usd", f9.moneda, "usd");
igual("ruido al inicio", parseFactura("RIF J-1234567-8\nES 1 PEPSI ZERO LAT355x24U 1 18,9741 18,97").lineas[0]?.descripcion, "PEPSI ZERO LAT355x24U");
igual("IVA no mayor que la base", parseFactura("RIF J-1234567-8\nPOLLO 2 5,00 10,00\nBase imponible 10,00\nIVA 16% sobre:74.521,17").iva, 1.6);
igual("parecido OCR", parecido("PEPSI LIGHT LATA 355X24 UND", "Pees LIGHT LATA 355X24 UND") >= 0.6, true);
igual("no parecido", parecido("PEPSI LIGHT LATA 355X24 UND", "AGUA MINALBA 600ML x 24 UNID") < 0.6, true);

// ── Rótulos del resumen mal leídos por el OCR ──
const f4 = parseFactura(`
LA GRANJA C.A.
RIF J-31234567-0
POLLO ENTERO 3 4,00 12,00
QUESO BLANCO 2 5,00 10,00
SUB-T0TAL 22,00
1.V.A 16% 3,52
T0TAL $ 25,52
MONT0 EN DIVISAS 25,52
`);
igual("f4 #lineas", f4.lineas.length, 2);
igual("f4 subtotal", f4.subtotal, 22);
igual("f4 iva", f4.iva, 3.52);
igual("f4 total", f4.total, 25.52);

// ── Un renglón sin rótulo claro con el monto del subtotal no es producto ──
const f5 = parseFactura(`
LA GRANJA C.A.
RIF J-31234567-0
POLLO ENTERO 3 4,00 12,00
QUESO BLANCO 2 5,00 10,00
SUMA 22,00
SUBTOTAL 22,00
`);
igual("f5 #lineas", f5.lineas.length, 2);

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
