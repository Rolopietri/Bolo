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
  empaqueDe,
  contenidoDe,
  tipoResumen,
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

// ════════════════════════════════════════════════════════════════
// FORMATOS DE FACTURACIÓN: un caso por cada tipo de documento.
// ════════════════════════════════════════════════════════════════

// ── VE · Máquina fiscal con varias alícuotas (G 16 %, R 8 %, E) ──
const ve1 = parseFactura(`
SENIAT
RIF J-30123456-1
PANADERIA LA ESPIGA C.A.
FACTURA N°: 00045210
FECHA: 22/10/2026 HORA: 08:15
2 x 15,00
PAN CANILLA (R) 30,00
1 x 40,00
QUESO BLANCO KG (G) 40,00
3 x 5,00
HUEVOS (E) 15,00
SUBTTL 85,00
EXENTO 15,00
BI G16,00% 40,00
IVA G16,00% 6,40
BI R8,00% 30,00
IVA R8,00% 2,40
TOTAL 93,80
MH Z1B0012345
`);
igual("ve1 #lineas", ve1.lineas.length, 3);
igual("ve1 pan alícuota R", ve1.lineas[0]?.alicuota, "R");
igual("ve1 queso general (sin marca R/A)", ve1.lineas[1]?.alicuota, undefined);
igual("ve1 huevos exento", ve1.lineas[2]?.exento, true);
igual("ve1 alícuota R 8%", ve1.alicuotas?.R, 8);
igual("ve1 IVA general 16%", ve1.ivaPorc, 16);
igual("ve1 total", ve1.total, 93.8);
igual("ve1 tipo factura", ve1.tipo, "factura");

// ── VE · Nota de entrega sin precios ──
const ve2 = parseFactura(`
DISTRIBUIDORA EL TORO C.A.
RIF: J-59957472-8
NOTA DE ENTREGA N° 000781
FECHA: 20/10/2026
CANT DESCRIPCION
24 UND PEPSI ZERO LATA 355ML
2 CAJAS AGUA MINALBA 600ML x 24
HARINA PAN 1KG 20 BULTOS
RECIBIDO CONFORME: ____________
`);
igual("ve2 tipo nota de entrega", ve2.tipo, "nota_entrega");
igual("ve2 numero", ve2.numero, "000781");
igual("ve2 #lineas", ve2.lineas.length, 3);
igual("ve2 l1 cant", ve2.lineas[0]?.cantidad, 24);
igual("ve2 l1 sin precio", ve2.lineas[0]?.sinPrecio, true);
igual("ve2 l2 desc", ve2.lineas[1]?.descripcion, "AGUA MINALBA 600ML x 24");
igual("ve2 l2 empaque", ve2.lineas[1]?.porEmpaque, 24);
igual("ve2 l3 cant", ve2.lineas[2]?.cantidad, 20);
igual("ve2 l3 desc", ve2.lineas[2]?.descripcion, "HARINA PAN 1KG");

// ── VE · Nota de crédito ──
igual("nota de crédito", parseFactura("NOTA DE CREDITO N° 0012\nRIF J-1234567-8").tipo, "nota_credito");

// ── EE. UU. · Invoice en inglés, fecha mes/día, Sales Tax ──
const us = parseFactura(`
ACME RESTAURANT SUPPLY INC
EIN 12-3456789
INVOICE # 10482
Invoice Date: 09/23/2026
Due Date: 10/23/2026
QTY DESCRIPTION UNIT PRICE AMOUNT
2 Olive Oil 1L 12.50 25.00
3 Flour 5 lb 4.00 12.00
Subtotal 37.00
Sales Tax (8%) 2.96
Shipping 5.00
Amount Due $44.96
`);
igual("us id fiscal", us.rif, "12-3456789");
igual("us numero", us.numero, "10482");
igual("us fecha mes/día", us.fecha, "2026-09-23");
igual("us moneda", us.moneda, "usd");
igual("us #lineas", us.lineas.length, 2);
igual("us l1 cant", us.lineas[0]?.cantidad, 2);
igual("us l1 total", us.lineas[0]?.total, 25);
igual("us subtotal", us.subtotal, 37);
igual("us tax %", us.ivaPorc, 8);
igual("us flete (shipping)", us.flete, 5);
igual("us total", us.total, 44.96);

// ── España · IVA 21 %, euros, NIF ──
const es = parseFactura(`
ACEITES DEL SUR S.L.
NIF B12345678
Factura nº F2026-0153
Fecha: 15 de octubre de 2026
Concepto Uds Precio Importe
Aceite de oliva virgen 5L 2 28,50 57,00
Vinagre de Jerez 750ml 6 3,20 19,20
Base imponible 76,20
IVA 21% 16,00
Total factura 92,20 €
`);
igual("es nif", es.rif, "B12345678");
igual("es numero", es.numero, "F2026-0153");
igual("es fecha con mes en letras", es.fecha, "2026-10-15");
igual("es moneda otra EUR", es.monedaOtra, "EUR");
igual("es #lineas", es.lineas.length, 2);
igual("es iva %", es.ivaPorc, 21);
igual("es total", es.total, 92.2);

// ── México · CFDI: RFC, IVA 16 %, MXN ──
const mx = parseFactura(`
ABARROTES LA PROVIDENCIA SA DE CV
RFC: APR010101AB1
Folio: A-4521
Fecha: 2026-10-05
Cantidad Descripción Valor unitario Importe
10 Tortilla de maíz kg 22.00 220.00
5 Frijol negro kg 38.00 190.00
Subtotal 410.00
IVA 16% 0.00
Total 410.00 MXN
`);
igual("mx rfc", mx.rif, "APR010101AB1");
igual("mx folio", mx.numero, "A-4521");
igual("mx fecha ISO", mx.fecha, "2026-10-05");
igual("mx moneda otra", mx.monedaOtra, "MXN");
igual("mx #lineas", mx.lineas.length, 2);
igual("mx total", mx.total, 410);

// ── Perú · RUC, IGV 18 %, serie-número, S/ ──
const pe = parseFactura(`
DISTRIBUIDORA LIMA S.A.C.
RUC 20123456789
FACTURA ELECTRÓNICA F001-00012345
Fecha de emisión: 03/10/2026
CANT. DESCRIPCIÓN P.UNIT IMPORTE
4 ARROZ EXTRA 5KG 21.50 86.00
OP. GRAVADA 86.00
IGV 18% 15.48
IMPORTE TOTAL S/ 101.48
`);
igual("pe ruc", pe.rif, "20123456789");
igual("pe serie-número", pe.numero, "F001-00012345");
igual("pe fecha", pe.fecha, "2026-10-03");
igual("pe igv %", pe.ivaPorc, 18);
igual("pe base (op. gravada)", pe.base, 86);
igual("pe total", pe.total, 101.48);
igual("pe moneda otra", pe.monedaOtra, "PEN");
igual("pe #lineas", pe.lineas.length, 1);

// ── Colombia · NIT, IVA 19 %, miles con punto ──
const co = parseFactura(`
LACTEOS DEL VALLE S.A.S.
NIT 900.123.456-7
Factura de venta No. FE-8812
Fecha: 12/10/2026
LECHE ENTERA 1L 12 3.900 46.800
QUESO CAMPESINO 2 18.500 37.000
Subtotal 83.800
IVA 19% 15.922
Total a pagar COP 99.722
`);
igual("co nit", co.rif, "900.123.456-7");
igual("co numero", co.numero, "FE-8812");
igual("co #lineas", co.lineas.length, 2);
igual("co l1 total (miles con punto)", co.lineas[0]?.total, 46800);
igual("co iva %", co.ivaPorc, 19);
igual("co total", co.total, 99722);

// ── Fechas en inglés con nombre de mes y miles con apóstrofo ──
igual("fecha 'Sep 10, 2026'", parseFactura("Invoice Date: Sep 10, 2026").fecha, "2026-09-10");
igual("fecha '10-SEP-2026'", parseFactura("FECHA: 10-SEP-2026").fecha, "2026-09-10");
igual("miles con apóstrofo", parseFactura("RIF J-1234567-8\nCARNE 2 1'250.00 2'500.00").lineas[0]?.total, 2500);

// ── Rótulos que no son productos ni fórmula ──
igual("retención no es total", tipoResumen("RETENCION IVA 75% 12,00"), "otro");
igual("propina no es producto", parseFactura("RIF J-1234567-8\nPROPINA 10% 5,00").lineas.length, 0);
igual("producto con BASE en el nombre", parseFactura("RIF J-1234567-8\nBASE PARA PIZZA 2 3,00 6,00").lineas[0]?.descripcion, "BASE PARA PIZZA");

// ════════════════════════════════════════════════════════════════
// TEXTOS REALES DEL BANCO DE FOTOS (lo que devolvió el OCR), sin datos del
// cliente. Cada uno falló en la primera medición.
// ════════════════════════════════════════════════════════════════

// Tu Mayor al Detal: la impresora usa el punto también como decimal.
const b23 = parseFactura(`SENIAT
J-50674849-5
TU MAYOR AL DETAL. C.A.
FACTURA $: 00020157
FECHA: 07/03/2026 HORA: 12:20 |
FLOR DE JAMAICA 1 KILO (E) Bs 3.712.24 '
EXENTO Bs 3.712.24
TOTAL Bs 3.712.24`);
igual("b23 total 3.712.24", b23.total, 3712.24);
igual("b23 producto", b23.lineas[0]?.total, 3712.24);
igual("b23 numero", b23.numero, "00020157");

// Alimentos 777: se perdió la palabra TOTAL; (6) es (G); el total sale de la
// fórmula y del EFECTIVO.
const b17 = parseFactura(`J-50570
00000376
FACTURA
VIVERES (E) (E) Bs 2189,32
VIVERES (E) Bs 4870,12
VIVERES (6) gs 1348,10
PERFUMERIA (6) Bs 1926.72
BE 6016, 000) Bs 3274,83
1VAG(16, 00%) Bs 523,97
SUBTTL Bs 10334,27
EFECTIVO Bs 10858,24
- Be 10858,24`);
igual("b17 total sin la palabra TOTAL", b17.total, 10858.24);
igual("b17 #lineas", b17.lineas.length, 4);
igual("b17 (6) es G, no exento", b17.lineas[2]?.exento, false);

// Inside Market: descripción arriba, "cant X precio (E) monto" abajo.
const b10 = parseFactura(`RIF J-401583806
FACTURA: 00005066
FECHA: 21-03-2026 HORA: 11:01
IPULPA DE PARCHITA MANGUANGUA 500G!
2 X 1.974,59 (E) Bs 3.949,18
.FILETES DE ANCHOAS VISCIANO 80 GR!
2 X 3.439,98 (G) Bs 6.879,96
IBOLSA DE SUPERMERCADO RIO!
1 X 22,85 (E) Bs 22,85
EXENTO Bs 3.972,03
BI G16,00% Bs 6.879,96 IVA G16,00% Bs 1.100,79
SUBTTL Bs 10.851,99 IVA Bs 1.100,79
TOTAL
Bs 11.952,78`);
igual("b10 #lineas (dos renglones)", b10.lineas.length, 3);
igual("b10 l1 desc", b10.lineas[0]?.descripcion, "IPULPA DE PARCHITA MANGUANGUA 500G");
igual("b10 l1 cant", b10.lineas[0]?.cantidad, 2);
igual("b10 l1 exento", b10.lineas[0]?.exento, true);
igual("b10 l2 total", b10.lineas[1]?.total, 6879.96);
igual("b10 l2 gravado", b10.lineas[1]?.exento, false);
igual("b10 total en el renglón de abajo", b10.total, 11952.78);

// Cold 2024: "cant x precio … monto" arriba, descripción abajo.
const b18 = parseFactura(`RIF J-505366220
FACTURA: 00083075
FECHA: 16-03-2026
0,55xBs 3.033,77 Bs 1.668,57
AGUACATE INJERTO KG (E)
2x Bs 1.210,83 Bs 2.421,66
ALBAHACA PARADIS 50 GR (E)
0,225xBs 15.075,03 Bs 3.391,88
TOCINETA OSCAR MAYER REBANADA (G)
SUBTTL Bs 7.482,11
EXENTO Bs 4.090,23
BI G16,00% Bs 3.391,88 IVA G16,00% Bs 542,70
Bs 8.024,81`);
igual("b18 #lineas", b18.lineas.length, 3);
igual("b18 aguacate", b18.lineas[0]?.descripcion, "AGUACATE INJERTO KG");
igual("b18 aguacate kg", b18.lineas[0]?.cantidad, 0.55);
igual("b18 tocineta gravada", b18.lineas[2]?.exento, false);
igual("b18 total por fórmula", b18.total, 8024.81);

// D'limón: "Neto" después del IVA es el total; el OCR perdió la coma.
const b11 = parseFactura(`COMERCIALIZADORA 222 ARA, CA RIF.. J-40145547-6
FACTURA N° 25065
| 10001 | JUGO PURO DE LIMON 1LT | 2.00 UNID | 5,463.00 | 10,926.00
Sub-Total: 10,926.00
I.V.A.: 16.00% 1,748.16
Neto: 1267416)`);
igual("b11 neto después del IVA = total", b11.total, 12674.16);
igual("b11 subtotal", b11.subtotal, 10926);

// ── Aritmética de la factura ──
igual("renglón: 8 leído como 6 en el monto", parseFactura("RIF J-1234567-8\nANCHOAS 2 3.439,98 6.679,96").lineas[0]?.total, 6879.96);
igual("renglón: precio con un 4 leído como 9", parseFactura("RIF J-1234567-8\nANCHOAS 2 3.939,98 6.879,96").lineas[0]?.precioUnit, 3439.98);
const arit = parseFactura(`RIF J-1234567-8
PAN CANILLA 2 15,00 30,00
QUESO BLANCO 1 40,00 40,00
OPERACION REF 99,00
SUBTOTAL 70,00
TOTAL 70,00`);
igual("suma: renglón basura fuera", arit.lineas.length, 2);
const arit2 = parseFactura(`RIF J-1234567-8
PAN CANILLA 30,00
QUESO BLANCO 46,00
SUBTOTAL 70,00`);
igual("suma: un dígito corregido para cuadrar", arit2.lineas[1]?.total, 40);

igual("espacio tras la coma: 7059, 44", parseFactura("RIF J-1234567-8\nEXENTO Bs 7059, 44").exento, 7059.44);
const noDanar = parseFactura(`J-505704478
Bs 2189,32
VIVERES (E) (E) Bs 4870,12
VIVERES (E) (E) B 1348,10
VIVERES (G) Bs 1926,72
EXENTO Bs 7059, 44
BI G(16,00%) Bs 3274,83
SUBTTL Bs 10334,27
TOTAL B8 10858,24`);
igual("la aritmética no daña un monto bueno", noDanar.lineas[0]?.total, 4870.12);

// ── Rótulos de ticket mal leídos (banco de fotos, PaddleOCR) ──
igual("SUBTT es subtotal", tipoResumen("SUBTT Bs 73750, 50"), "subtotal");
igual("SBTL es subtotal", tipoResumen("SBTL 3s 29. 591, 25"), "subtotal");
igual("TUTAL es total", tipoResumen("TUTAL BS. 6.373,50"), "total");
igual("EHECT VO no es producto", parseFactura("RIF J-1234567-8\nEHECT VO Bs 73750, 50").lineas.length, 0);
igual("PAGD RAPIDO no es producto", parseFactura("RIF J-1234567-8\nPAGD RAPIDO 29.591,25").lineas.length, 0);
igual("Vencimiento no es exento", parseFactura("Vencimiento: 17/09/2026 EMISIÓN: 10/09/2026|12:36:18").exento, undefined);
igual("basura de logo no es producto", parseFactura("RIF J-1234567-8\ncYam ntaYe Bs 786.14").lineas.length, 0);

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

// ── Empaque y contenido escritos en el nombre ──
igual("empaque 355x24U", empaqueDe("PEPSI ZERO LAT355x24U"), 24);
igual("empaque x 24 UNID", empaqueDe("AGUA MINALBA 600ML x 24 UNID"), 24);
igual("empaque 355X24 UND", empaqueDe("PEPSI LIGHT LATA 355X24 UND"), 24);
igual("empaque CARTON 30 UND", empaqueDe("HUEVOS CARTON 30 UND"), 30);
igual("sin empaque (1KG es presentación)", empaqueDe("HARINA PAN 1KG"), undefined);
igual("sin empaque (x 1 KG)", empaqueDe("HARINA x 1 KG"), undefined);
igual("contenido 600ML", contenidoDe("AGUA MINALBA 600ML x 24 UNID")?.valor, 600);
igual("contenido 1KG", contenidoDe("HARINA PAN 1KG")?.unidad, "kg");
igual("contenido 1,5 L", contenidoDe("REFRESCO 1,5 L")?.valor, 1.5);

// ── Nombres con tolerancia: "cero"/"zero", "lata"/"LAT355" ──
const pepsis = [
  { id: "light", nombre: "PEPSI LIGHT LATA" },
  { id: "cero", nombre: "PEPSI CERO LATA" },
];
igual("sug PEPSI CERO LATA", sugerirInsumo("PEPSI ZERO LAT355x24U", pepsis)?.id, "cero");
igual("sug light (OCR Pees)", sugerirInsumo("Pees LIGHT LATA 355X24 UND", pepsis)?.id, "light");
const cajas = [
  { id: "suelta", nombre: "PEPSI ZERO LATA" },
  { id: "caja", nombre: "PEPSI ZERO CAJA" },
];
const cj = parseFactura("RIF J-1234567-8\n1.- PEPSI ZERO LAT355x24U 1 CJ 24 0.355 8.52 0 18,9741 16.00 0.00 18,97\nHUEVOS CARTON 30 UND 2 5,25 10,50").lineas;
igual("sin '1 CJ' en el nombre", cj[0]?.descripcion, "PEPSI ZERO LAT355x24U");
igual("empaque se conserva", cj[0]?.porEmpaque, 24);
igual("30 UND sigue en el empaque", cj[1]?.porEmpaque, 30);
igual(
  "zero no es light aunque ambos digan lata",
  sugerirInsumo("PEPSI ZERO LATA 355ML", [
    { id: "light", nombre: "PEPSI LIGHT LATA" },
    { id: "cero", nombre: "PEPSI CERO CAJA" },
  ])?.id,
  "cero",
);
igual("prefiere el empaque", sugerirInsumo("PEPSI ZERO LAT355x24U", cajas, (i) => i.id === "caja")?.id, "caja");

if (fallas > 0) {
  console.error(`\n${fallas} prueba(s) del lector de facturas fallaron.`);
  process.exit(1);
}
console.log("✓ Lector de facturas: todas las pruebas pasan.");
