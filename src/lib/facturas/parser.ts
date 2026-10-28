// Lector de facturas: convierte el TEXTO de una factura (lo que devuelve el OCR,
// o lo que se pegue a mano) en campos de compra.
//
// Cubre los documentos venezolanos (Providencia SNAT/2011/0071): factura en
// formato libre o preimpreso, ticket de máquina fiscal (alícuotas (G) general,
// (R) reducida, (A) adicional, (E) exento; BI/IVA por alícuota; IGTF 3 %),
// factura digital, notas de crédito y débito, y notas de entrega / guías de
// despacho (con o sin precios), en Bs o con su equivalente en divisas.
// Y los patrones comunes de otros países: RUC/NIT/RUT/CUIT/RFC/NIF…, IVA, IGV,
// ITBIS, ITBMS, VAT, Sales tax, "Amount due", fechas con nombre de mes o
// mes/día, y números "1.234,56", "1,234.56" o "1'234.56".
//
// Es a propósito un módulo PURO y sin imports: no toca la base ni el navegador,
// así se prueba solo con `npm run test:facturas`. Nunca es perfecto: todo lo que
// devuelve pasa por el preview editable antes de guardarse.

export type LineaLeida = {
  descripcion: string;
  /** Cantidad tal como viene en la factura (en la unidad del proveedor). */
  cantidad: number;
  precioUnit?: number;
  /** Total de la línea en la moneda de la factura (normalmente sin IVA). */
  total: number;
  /** Producto exento de IVA (marcado con "(E)" en la factura). */
  exento: boolean;
  /** "alta" si la línea trae varios números que cuadran (cantidad × precio =
   *  total); "baja" si solo trae un monto suelto: puede ser un renglón que no
   *  es producto (dirección, teléfono mal leído…). */
  confianza: "alta" | "baja";
  /** La cantidad venía escrita con decimales ("1,1895", "10,000"): es una
   *  medida (peso o volumen), no unidades sueltas. */
  pesable: boolean;
  /** Unidades que trae cada empaque, si el nombre lo dice ("LAT355x24U",
   *  "600ML x 24 UNID", "CARTON 30 UND" → 24, 24, 30). */
  porEmpaque?: number;
  /** Contenido de cada unidad, si el nombre lo dice ("600ML", "1KG"). */
  contenido?: { valor: number; unidad: string };
  /** Los demás números del renglón (para corregir comas perdidas con el
   *  resumen de la factura). Uso interno del lector. */
  valores?: number[];
  /** Alícuota venezolana del producto: (G) general, (R) reducida, (A) adicional. */
  alicuota?: "G" | "R" | "A";
  /** Renglón de una nota de entrega sin precios: hay que escribir el monto. */
  sinPrecio?: boolean;
  /** Unidad de la cantidad cuando la factura la escribe ("1,1895 KG x",
   *  "CARNE DE RES KG", "500 GR"). No confundir con la presentación pegada al
   *  nombre ("HARINA PAN 1KG" es el tamaño del paquete). */
  unidadLeida?: UnidadLeida;
};

export type UnidadLeida = "kg" | "g" | "L" | "ml" | "unidad";

const MEDIDA = "(?:kg|kgs|g|gr|grs|ml|cc|l|lt|lts|oz)";

/** Unidades por empaque escritas en el nombre: "x24", "355X24 UND", "24U",
 *  "x 24 UNID", "CARTON 30 UND". No confunde la presentación ("x 1 KG"). */
export function empaqueDe(descripcion: string): number | undefined {
  const d = descripcion.toLowerCase();
  const porX = d.match(new RegExp(`x\\s*(\\d{1,3})(?!\\d)(?!\\s*${MEDIDA}\\b)`));
  const porU = d.match(/(\d{1,3})\s*(?:u|und|unds|unid|unidades|uds?|pz|pzas|pcs)\b/);
  const n = Number(porX?.[1] ?? porU?.[1]);
  return n >= 2 ? n : undefined;
}

/** Contenido de cada unidad escrito en el nombre ("600ML", "1KG", "1,5 L"). */
export function contenidoDe(descripcion: string): { valor: number; unidad: string } | undefined {
  const m = descripcion.toLowerCase().match(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(${MEDIDA})\\b`));
  if (!m) return undefined;
  const valor = Number(m[1].replace(",", "."));
  const unidad = { kgs: "kg", gr: "g", grs: "g", cc: "ml", lt: "L", lts: "L", l: "L" }[m[2]] ?? m[2];
  return valor > 0 ? { valor, unidad } : undefined;
}

/** Reconoce una palabra suelta de unidad ("KG", "Kgs", "GR", "LTS", "UND"). */
export function unidadDeToken(token: string): UnidadLeida | undefined {
  const t = token.toLowerCase().replace(/[.:]/g, "");
  if (/^(kg|kgs|kilo|kilos|kilogramos?)$/.test(t)) return "kg";
  if (/^(g|gr|grs|gramos?)$/.test(t)) return "g";
  if (/^(l|lt|lts|litros?)$/.test(t)) return "L";
  if (/^(ml|cc|mililitros?)$/.test(t)) return "ml";
  if (/^(und|unds|unid|unidad|unidades|un|pza|pzas|pieza|piezas)$/.test(t)) return "unidad";
  return undefined;
}

export type FacturaLeida = {
  proveedorNombre?: string;
  rif?: string;
  numero?: string;
  /** YYYY-MM-DD */
  fecha?: string;
  moneda?: "bs" | "usd";
  ivaPorc?: number;
  subtotal?: number;
  /** Base imponible (lo que paga IVA). */
  base?: number;
  iva?: number;
  /** Monto exento de IVA. */
  exento?: number;
  /** Impuesto a las grandes transacciones financieras (pagos en divisas). */
  igtf?: number;
  descuento?: number;
  /** Total impreso (normalmente "TOTAL A PAGAR"; incluye el IGTF si lo hay). */
  total?: number;
  /** Tasa Bs/$ que trae la propia factura ("Tipo de cambio BCV Bs. 827,7371"). */
  tasa?: number;
  /** Flete / delivery / envío cobrado en la factura (no es un producto). */
  flete?: number;
  /** % de cada alícuota leída en el resumen ("IVA R 8%", "IVA A 15%"). */
  alicuotas?: { G?: number; R?: number; A?: number };
  /** Qué documento es. */
  tipo?: "factura" | "nota_entrega" | "nota_credito" | "nota_debito" | "ticket";
  /** Moneda distinta de Bs o $ (EUR, COP, MXN, PEN…), para avisar. */
  monedaOtra?: string;
  lineas: LineaLeida[];
};

/** Minúsculas, sin acentos, sin signos y con un solo espacio. Es la llave con
 *  la que se recuerdan las equivalencias ("Harina P.A.N. 1Kg" = "harina pan 1kg"). */
export function normalizarDescripcion(s: string): string {
  // \u0300-\u036f: tildes separadas por NFD (con código, no literal: el
  // minificador puede corromper el carácter).
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, " ")
    .replace(/(\d) (kg|g|gr|grs|ml|lt|l|lts|cc|un|und|unid)\b/g, "$1$2")
    .replace(/\b([a-z]) (?=[a-z]\b)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** Lee una CANTIDAD. A diferencia de los montos, la coma de una cantidad es
 *  siempre decimal: las máquinas fiscales imprimen "1,250" (1,25 kg), nunca
 *  mil doscientos cincuenta. */
export function parseCantidad(raw: string): number | null {
  const s = raw.trim();
  // Un solo separador es decimal, sea coma, punto o espacio: el OCR de los
  // tickets térmicos suele leer la coma de "11,895" como punto o espacio.
  if (/^\d+[.,\s]\d+$/.test(s)) return Number(s.replace(/[.,\s]/, "."));
  return parseNumero(s);
}

/** Corrige una coma perdida o mal leída usando la propia factura: cantidad ×
 *  precio tiene que dar el monto del renglón. Si no da, prueba correr la coma
 *  de la cantidad (y, si hace falta, la del precio) hasta que cuadre. */
export function ajustarCantidad(
  cantidad: number,
  precio: number,
  total: number,
  /** La cantidad ya venía con su separador decimal: solo se corrige el precio. */
  cantidadConfiable = false,
): { cantidad: number; precio: number } {
  const cuadra = (c: number, p: number) => Math.abs(c * p - total) <= Math.max(0.02, total * 0.005);
  if (!(cantidad > 0) || !(precio > 0) || !(total > 0) || cuadra(cantidad, precio)) return { cantidad, precio };
  let mejor = null as { cantidad: number; precio: number; pasos: number } | null;
  // Si la cantidad trae su coma, primero se intenta corregir solo el precio;
  // si así no cuadra, se prueba también con la cantidad ("1.000" = mil).
  const rangos = cantidadConfiable ? [[0, 0], [-4, 3]] : [[-4, 3]];
  for (const [desde, hasta] of rangos) {
    for (let kc = desde; kc <= hasta; kc++) {
      for (let kp = -2; kp <= 0; kp++) {
        const c = cantidad * 10 ** kc;
        const p = precio * 10 ** kp;
        const pasos = Math.abs(kc) + Math.abs(kp);
        if (cuadra(c, p) && (!mejor || pasos < mejor.pasos)) mejor = { cantidad: c, precio: p, pasos };
      }
    }
    if (mejor) break;
  }
  return mejor
    ? { cantidad: Number(mejor.cantidad.toFixed(6)), precio: Number(mejor.precio.toFixed(6)) }
    : { cantidad, precio };
}

/** true si la cantidad está escrita con decimales (es un peso). */
function escritaConDecimales(raw: string): boolean {
  return /^\d+[.,\s]\d+$/.test(raw.trim());
}

/** RIF canónico: letra + dígitos + dígito verificador, sin guiones (J123456789). */
export function normalizarRif(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Lee un número escrito como en Venezuela ("1.234,56") o en inglés ("1,234.56").
 *  null si no es un número. */
export function parseNumero(raw: string): number | null {
  let s = raw.trim().replace(/^(bs\.?s?|\$|usd|ref\.?)/i, "").replace(/(bs\.?|\$|%)$/i, "").trim();
  s = s.replace(/\s/g, "");
  if (!/^-?[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
  const ultPunto = s.lastIndexOf(".");
  const ultComa = s.lastIndexOf(",");
  if (ultPunto >= 0 && ultComa >= 0) {
    // El separador que aparece de último es el decimal.
    s = ultComa > ultPunto ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (ultComa >= 0) {
    const partes = s.split(",");
    const dec = partes[partes.length - 1];
    // "1,5" / "12,50" → decimal. "1,250" (3 dígitos, varias comas) → miles.
    const esDecimal = partes.length === 2 && (dec.length !== 3 || partes[0] === "0");
    s = esDecimal ? partes.join(".") : partes.join("");
  } else if (ultPunto >= 0) {
    const partes = s.split(".");
    const dec = partes[partes.length - 1];
    // Algunas impresoras usan el punto para todo: "3.712.24" = 3712,24.
    if (partes.length > 2 && dec.length === 2) {
      const n = Number(partes.slice(0, -1).join("") + "." + dec);
      return Number.isFinite(n) ? n : null;
    }
    // Convención venezolana: "1.500" son mil quinientos; "12.50" es decimal.
    s = partes.length > 2 || (dec.length === 3 && partes[0] !== "0") ? partes.join("") : s;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const RE_RIF = /\b([JVEGPC])\s*[-.]?\s*(\d{6,9})\s*[-.]?\s*(\d)\b/i;
// Identificación fiscal de otros países (si no hay RIF venezolano).
const RE_ID_FISCAL =
  /\b(?:N\.?I\.?T|R\.?U\.?C|R\.?U\.?T|CUIT|CUIL|RFC|RTN|CNPJ|NIF|CIF|EIN|TIN|VAT\s*(?:No|Reg(?:istration)?)?|Tax\s*ID)\b\.?\s*[:#]?\s*(?:N[°ºo.]*\s*)?([A-Z0-9][A-Z0-9.\-\/]{4,24})/i;
const RE_FECHA = /\b(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{2,4})\b/;
// ── La "fórmula" de la factura venezolana ──
// Renglones de resumen: subtotal, base imponible, IVA, exento, IGTF, descuento
// y total. Tolerantes a lo que suele confundir el OCR (0↔O, 1↔I↔L, 4↔A):
// "SUB-T0TAL", "1.V.A", "BI G16,00%", "SUBTTL".
const RE_RESUMEN = {
  // Cargos que no son productos ni parte de la fórmula: retenciones, propinas.
  otro: /\bretenci[oó]n\b|\bwithholding\b|\bpropina\b|\btip\b|\bservicio\s*\d{1,2}\s*%|\bservice\s*charge\b|\banticipo\b|\babono\b|\bsaldo\s+anterior\b/i,
  subtotal:
    /\bs[uv]b\s*[-.]?\s*t[o0]t(?:[a4][l1i])?\b|\bsubttl\b|\bsub\s*[-.]?\s*ttl\b|\bsuma\b|\btotal\s+parcial\b|\bnet\s*amount\b|\bimporte\s+neto\b|\bvalor\s+neto\b|\bneto\b/i,
  igtf: /\b[i1l]\s*g\s*t\s*f\b/i,
  flete: /\bflete\b|\bdelivery\b|\benv[ií]o\b|\bshipping\b|\bfreight\b|\btransporte\b|\bdespacho\s+a\s+domicilio\b/i,
  base: /(?:^|\s)b\.?\s?[i1l]\.?(?=\s|$)|\bbi\s*[gra]\s*\d|\bbase\b|\bimp[o0]nible\b|\bgravad[oa]\b|\bgravable\b|\btaxable\b|\bafect[oa]\b/i,
  exento: /\bexent[oa]s?\b|\bexoner|\binafect[oa]\b|\bno\s+gravad|\bno\s+sujet|\btax\s*exempt\b|\bexempt\b|\bzero\s*rated\b/i,
  iva: /\b[i1l]\.?\s*v\.?\s*[a4](?:\b|[gra]\s*\()|(?:^|\s)v\.?\s*a\s*\d{1,2}(?:[.,]\d+)?\s*%|\bimpuestos?\b|\bal[ií1l]cu[o0]ta\b|%\s*sobre\b|\bigv\b|\bitbis\b|\bitbms\b|\bisv\b|\bvat\b|\b(?:sales\s*)?tax\b|\bgst\b|\bhst\b|\bmwst\b|\btva\b|\bbtw\b/i,
  descuento: /\bdesc(?:uento|to)?\b|\bdscto\b|\brebaja\b|\bdiscount\b|\bbonificaci[oó]n\b/i,
  total: /\bt[o0]t[a4][l1i]\b|\ba\s+pagar\b|\bamount\s+due\b|\bbalance\s+due\b|\bgrand\s+total\b|\bimporte\b|\bvalor\s+a\s+pagar\b/i,
};
// Un total "fuerte" se reconoce antes que el subtotal: "Total neto más
// impuestos", "Neto a pagar", "Amount due", "Importe total".
const RE_TOTAL_FUERTE =
  /(?<!s[uv]b\s*[-.]?\s*)\bt[o0]t[a4][l1i]\s+(?:a\s+pagar|general|factura|neto|due|amount|usd|bs|eur)\b|\bneto\s+a\s+pagar\b|\bamount\s+due\b|\bbalance\s+due\b|\bgrand\s+total\b|\b(?:importe|monto|valor|gran)\s+total\b|\btotal\s+(?:a\s+)?pagar\b/i;
// Otros renglones que NO son productos aunque terminen en un número.
const RE_NO_PRODUCTO =
  /\b(rif|r\.i\.f|c\.?\s*i\.?|nit|ruc|rut|cuit|cuil|rfc|rtn|cnpj|cpf|nif|cif|ein|ncf|cufe|cae|uuid|folio|timbre|fecha|date|factura|invoice|bill\s+to|ship\s+to|sold\s+to|customer|control|tel[eé]?f?|telf|phone|e-?mail|www|http|direcci|domicilio|address|cliente|raz[oó]n|forma\s*de\s*pago|pago|payment|m[oó]vil|transferencia|cambio|tasa|bcv|ref|son:?|serie|caja\s*[:#n°º]|cajer[oa]|cashier|vendedor|hora|p[aá]gina|page|n[°º]|seniat|sunat|dian|sat|contribuyente|efectivo|cash|tarjeta|card|d[eé]bito|cr[eé]dito|punto|divisas?|zelle|vuelto|change|recibido|items?|art[ií]culos|gracias|thank|firma|contado|vence|vencimiento|due|condiciones|terms|zona|calle|avenida|av|edif|piso|local|galp[oó]n|sector|urb|aceptamos|billetes|deteriorados|plazo|conforme|despach\w*|conductor|placas?|veh[ií]culo|sello|envases|entregados|recibidos|original|copia|autorizaci[oó]n|resoluci[oó]n|providencia)\b/i;

/** Qué parte de la fórmula es un renglón (o null si no es de resumen). */
export function tipoResumen(linea: string): keyof typeof RE_RESUMEN | null {
  if (RE_RESUMEN.otro.test(linea)) return "otro";
  if (RE_TOTAL_FUERTE.test(linea)) return "total";
  if (RE_RESUMEN.subtotal.test(linea)) return "subtotal";
  if (RE_RESUMEN.igtf.test(linea)) return "igtf";
  if (RE_RESUMEN.flete.test(linea)) return "flete";
  if (RE_RESUMEN.base.test(linea)) return "base";
  if (RE_RESUMEN.exento.test(linea) && !/\(\s*e\s*\)/i.test(linea)) return "exento";
  if (RE_RESUMEN.iva.test(linea)) return "iva";
  if (RE_RESUMEN.descuento.test(linea)) return "descuento";
  if (RE_RESUMEN.total.test(linea)) return "total";
  return null;
}

/** La etiqueta de un número es el texto entre el número anterior y él (si
 *  ese tramo no trae etiqueta, la del tramo de antes): en "BI G16% Bs 3.391,88
 *  IVA G16% Bs 542,70" el 542,70 es IVA; en "Exento IVA 0,00 0,00" los dos
 *  son exentos; en "Base imponible 74.521,17 | 90,03" los dos son base. */
function tipoCercano(etiqueta: string): keyof typeof RE_RESUMEN | null {
  // Se corta solo en montos con decimales (no en "1.V.A" ni en "16%").
  const tramos = etiqueta.split(/\d+[.,]\d+(?:[.,]\d+)*(?![\d.,]*\s*%)/);
  for (let i = tramos.length - 1; i >= 0; i--) {
    const t = tipoResumen(tramos[i]);
    if (t) return t;
  }
  return null;
}

/** ¿El renglón es parte del resumen? El rótulo tiene que estar al inicio y el
 *  renglón traer pocos montos (o un %), para no descartar productos como
 *  "BASE PARA PIZZA 2 3,00 6,00". */
function esRenglonResumen(linea: string): boolean {
  if (!tipoResumen(linea)) return false;
  const inicio = linea.replace(/^[^A-Za-z\u00C0-\u017F]+/, "").split(/\s+/).slice(0, 4).join(" ");
  const montos = (linea.match(/\d[\d.,]*\d|\d/g) ?? []).length;
  return (tipoResumen(inicio) !== null && montos <= 2) || /%/.test(linea);
}

// Renglón de cantidad de las máquinas fiscales, encima del producto:
// "10 x 5.000,00" o "1,1895 X Bs 61.700,00".
const RE_CANT_X_PRECIO =
  /^(\d+(?:[.,]\d+|\s\d{3,4})?)\s*(kgs?|kilos?|grs?|g|lts?|l|ml|cc|unds?|unid|un|pzas?)?\.?\s*[x×*]\s*(?:bs\.?\s*|\$\s*)?(\d[\d.,]*)$/i;

function fechaISO(d: number, m: number, a: number): string | undefined {
  const anio = a < 100 ? 2000 + a : a;
  if (m < 1 || m > 12 || d < 1 || d > 31 || anio < 2000 || anio > 2100) return undefined;
  return `${anio}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Intenta leer una línea de producto. null si no parece un producto. */
export function parseLineaProducto(lineaOriginal: string): LineaLeida | null {
  let linea = lineaOriginal;
  if (esRenglonResumen(linea) || RE_NO_PRODUCTO.test(linea)) return null;
  linea = linea
    .replace(/[(\[{]\s*[68b]\s*[)\]}]/gi, "(G)")
    .replace(/(?:^|\s)[ct(\[]\s*e\s*[)\]](?=\s|$)/gi, " (E)");
  const exento = /\(\s*e\s*\)|\s\*?E$/i.test(linea);
  const marca = linea.match(/\(\s*([gra])\s*\)/i);
  const alicuota = marca ? (marca[1].toUpperCase() as "G" | "R" | "A") : undefined;
  const limpia = linea
    // Miles con apóstrofo ("1'234.56", Perú/Suiza).
    .replace(/(\d)['’](\d{3})/g, "$1$2")
    .replace(/\(\s*e\s*\)/gi, " ")
    // Marcas de alícuota de la máquina fiscal: (G) general, (R) reducida, (A) adicional.
    .replace(/\(\s*[gra]\s*\)/gi, " ")
    .replace(/\b(bs\.?s?|usd|ref)\b|\$/gi, " ")
    .replace(/\s\*?E$/i, " ")
    // Ruido típico del OCR en tablas: bordes y comillas sueltas.
    .replace(/[|“”"'`´‘’\[\]{}!;¡¿—–_]/g, " ")
    // Número de renglón ("1.-", "2)", "3 -") delante de la descripción.
    .replace(/^\s*\d{1,3}\s*[.\-)]{1,3}[\s,.]*(?=[A-Za-z\u00C0-\u017F])/, "")
    .trim();
  const tokens = limpia
    .split(/\s+/)
    .filter(Boolean)
    // "43.20," o "14,40:" → el signo final es ruido, no un decimal.
    .map((t) => (/^\(?\d[\d.,]*\)?[.,:]*$/.test(t) ? t.replace(/^\(|\)?[.,:]*$/g, "") : t))
    .filter(Boolean);
  // Números al final de la línea (cantidad / precio / total).
  const finales: number[] = [];
  while (tokens.length > 0) {
    const ultimo = tokens[tokens.length - 1];
    // "x" suelto entre cantidad y precio ("2 x 45,00").
    if (/^[x*]$/i.test(ultimo)) {
      tokens.pop();
      continue;
    }
    const n = parseNumero(ultimo);
    if (n === null) break;
    finales.unshift(n);
    tokens.pop();
  }
  if (finales.length === 0) return null;
  // Cantidad al inicio ("2 HARINA PAN 45,00 90,00") y código del producto.
  let cantInicial: number | null = null;
  let pesable = false;
  if (tokens.length > 1 && /^\d{1,4}([.,]\d{1,4})?$/.test(tokens[0])) {
    cantInicial = parseCantidad(tokens[0]);
    pesable = escritaConDecimales(tokens[0]);
    tokens.shift();
  }
  // Código interno largo al inicio ("7591002000011 HARINA…", "A-1023 HARINA…").
  if (tokens.length > 1 && /\d/.test(tokens[0]) && tokens[0].replace(/[^0-9]/g, "").length >= 4 && !/(kg|gr?|ml|lt?)$/i.test(tokens[0])) {
    tokens.shift();
    if (cantInicial === null && tokens.length > 1 && /^\d{1,4}([.,]\d{1,4})?$/.test(tokens[0])) {
      cantInicial = parseCantidad(tokens[0]);
      pesable = escritaConDecimales(tokens[0]);
      tokens.shift();
    }
  }
  // Unidad escrita suelta en el renglón ("CARNE DE RES KG", "1,250 KG POLLO",
  // "QUESO X KG"). La pegada a un número ("1KG") es la presentación: no cuenta.
  let unidadLeida: UnidadLeida | undefined;
  for (const t of tokens) {
    // Una "G" o "L" suelta es ambigua (la G es también la marca de IVA general).
    const u = t.replace(/[.:]/g, "").length > 1 ? unidadDeToken(t) : undefined;
    if (u) unidadLeida = u;
  }
  // Ni empieza con ruido: letras o números sueltos antes de la primera palabra
  // ("ES 1 PEPSI…", "3 Pees LIGHT…").
  while (tokens.length > 1 && (tokens[0].length <= 2 || /^[\d.,]+$/.test(tokens[0]))) tokens.shift();
  // El empaque y el contenido se leen del nombre completo, antes de limpiarlo.
  const nombreCompleto = tokens.join(" ");
  // La descripción no termina en números sueltos, en ruido de una letra ni en
  // la columna "1 CJ" (son columnas que el OCR juntó con el nombre).
  while (
    tokens.length > 1 &&
    (/^[\d.,]+$/.test(tokens[tokens.length - 1]) ||
      tokens[tokens.length - 1].length <= 1 ||
      /^(cj|cja|caja|cajas|bto|bulto|bultos|paq|fardo|fardos|saco|sacos)$/i.test(tokens[tokens.length - 1]))
  )
    tokens.pop();
  const descripcion = tokens.join(" ").replace(/\s+/g, " ").trim();
  if ((descripcion.match(/[a-zñ]/gi) ?? []).length < 3) return null;

  const total = finales[finales.length - 1];
  if (!(total > 0)) return null;
  // Un solo número entero al final ("INVERSIONES LA GRANJA 2020") no es un
  // monto: los productos traen un total con decimales o varios números.
  if (finales.length === 1 && !/[.,]\d{2}$/.test(limpia)) return null;
  let cantidad = cantInicial ?? 1;
  let precioUnit: number | undefined;
  const cerca = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.02, b * 0.02);

  if (finales.length >= 3) {
    // Buscar entre los números previos al total un par cantidad × precio ≈ total.
    const previos = finales.slice(0, -1);
    let hallado = false;
    for (let i = 0; i < previos.length && !hallado; i++) {
      for (let j = 0; j < previos.length && !hallado; j++) {
        if (i !== j && cerca(previos[i] * previos[j], total)) {
          // La cantidad suele ir antes que el precio.
          const [q, p] = i < j ? [previos[i], previos[j]] : [previos[j], previos[i]];
          cantidad = q;
          precioUnit = p;
          hallado = true;
        }
      }
    }
    if (!hallado) {
      // La cantidad se leyó mal (en tablas suele salir "[1]" o "30" en vez de
      // "3 CJ"): se deduce de subtotal ÷ precio cuando da un número entero.
      let mejor: { q: number; p: number; desvio: number } | null = null;
      for (const p of previos) {
        // (el subtotal puede venir redondeado: 1 × 18,9741 = 18,97)
        if (!(p > 0) || p > total * 1.01) continue;
        const q = total / p;
        const desvio = Math.abs(q - Math.round(q)) / Math.max(1, q);
        if (Math.round(q) < 1 || Math.round(q) > 9999 || desvio > 0.0015) continue;
        // Mejor si esa cantidad aparece leída (aunque sea con un cero de más).
        const vista = previos.some((v) => v === Math.round(q) || v === Math.round(q) * 10) ? 0 : 0.001;
        if (!mejor || desvio + vista < mejor.desvio) mejor = { q: Math.round(q), p, desvio: desvio + vista };
      }
      if (mejor) {
        cantidad = mejor.q;
        precioUnit = mejor.p;
        hallado = true;
      }
    }
    if (!hallado && previos.length >= 2) {
      // Puede que el OCR haya perdido la coma de la cantidad o del precio.
      const aj = ajustarCantidad(previos[0], previos[1], total);
      if (Math.abs(aj.cantidad * aj.precio - total) <= Math.max(0.02, total * 0.005)) {
        cantidad = aj.cantidad;
        precioUnit = aj.precio;
        hallado = true;
        if (!Number.isInteger(cantidad)) pesable = true;
      }
    }
    if (!hallado) {
      cantidad = cantInicial ?? previos[0];
      precioUnit = cantidad > 0 ? total / cantidad : undefined;
    }
  } else if (finales.length === 2) {
    const [a] = finales;
    if (cantInicial !== null) {
      const aj = ajustarCantidad(cantInicial, a, total);
      cantidad = aj.cantidad;
      precioUnit = aj.precio;
      if (!Number.isInteger(cantidad)) pesable = true;
    } else if (cerca(a * (total / a), total) && a > 0 && a <= 999 && Number.isInteger(a) && a < total) {
      // "HARINA PAN 20 900,00": el primero es la cantidad.
      cantidad = a;
      precioUnit = total / a;
    } else {
      precioUnit = a;
      cantidad = a > 0 ? Math.round((total / a) * 1000) / 1000 : 1;
    }
  } else {
    precioUnit = cantidad > 0 ? total / cantidad : undefined;
  }
  if (!(cantidad > 0)) cantidad = 1;
  // Sin cantidad al inicio, una cantidad no entera también delata un peso.
  if (cantInicial === null && !Number.isInteger(cantidad)) pesable = true;
  return {
    descripcion,
    cantidad,
    precioUnit,
    total,
    exento,
    confianza: finales.length >= 2 ? "alta" : "baja",
    pesable,
    ...(alicuota && alicuota !== "G" ? { alicuota } : {}),
    valores: finales.slice(0, -1),
    porEmpaque: empaqueDe(nombreCompleto),
    contenido: contenidoDe(nombreCompleto),
    ...(unidadLeida ? { unidadLeida } : {}),
  };
}

const UNIDADES_ENTREGA =
  "(?:und|unds|unid|unidades|uds?|cj|cja|caja|cajas|bto|bulto|bultos|paq|paquetes?|fardos?|sacos?|docenas?|doc|pzas?|piezas?|kg|kgs|kilos?|g|gr|grs|lt|lts|l|litros?|ml|bolsas?|latas?|botellas?|cartones?|carton)";

/** Renglón de una nota de entrega / guía de despacho sin precios:
 *  "24 UND PEPSI ZERO LATA", "2 CAJAS AGUA MINALBA", "HARINA PAN 1KG 20 BULTOS".
 *  El monto queda por escribir. */
export function parseLineaSinPrecio(linea: string): LineaLeida | null {
  if (esRenglonResumen(linea) || RE_NO_PRODUCTO.test(linea)) return null;
  const l = linea
    .replace(/[|“”"'`´‘’\[\]{}!;¡¿—–_]/g, " ")
    .replace(/^\s*\d{1,3}\s*[.\-)]{1,3}[\s,.]*(?=[A-Za-z\u00C0-\u017F])/, "")
    .replace(/\s+/g, " ")
    .trim();
  const antes = l.match(new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*(${UNIDADES_ENTREGA})?\\.?\\s+(.+)$`, "i"));
  const despues = l.match(new RegExp(`^(.+?)\\s+(\\d+(?:[.,]\\d+)?)\\s*(${UNIDADES_ENTREGA})\\.?$`, "i"));
  const m = antes
    ? { cant: antes[1], unidad: antes[2], desc: antes[3] }
    : despues
      ? { cant: despues[2], unidad: despues[3], desc: despues[1] }
      : null;
  if (!m) return null;
  const descripcion = m.desc.trim();
  // La descripción tiene que tener palabras y no terminar en un monto.
  if (!/[A-Za-z\u00C0-\u017F]{3,}/.test(descripcion) || /\d[.,]\d{2}$/.test(descripcion)) return null;
  const cantidad = parseCantidad(m.cant);
  if (!cantidad || !(cantidad > 0) || cantidad > 99999) return null;
  const u = m.unidad ? unidadDeToken(m.unidad) : undefined;
  return {
    descripcion,
    cantidad,
    total: 0,
    exento: false,
    confianza: "alta",
    pesable: escritaConDecimales(m.cant),
    sinPrecio: true,
    porEmpaque: empaqueDe(descripcion),
    contenido: contenidoDe(descripcion),
    ...(u ? { unidadLeida: u } : {}),
  };
}

/** Descripción de un producto cuyo monto está en otro renglón: limpia el
 *  texto y lee marcas de alícuota, empaque y contenido. */
function parseLineaSinMonto(linea: string): Omit<LineaLeida, "cantidad" | "total" | "confianza" | "pesable"> {
  const l = linea
    .replace(/[(\[{]\s*[68b]\s*[)\]}]/gi, "(G)")
    .replace(/(?:^|\s)[ct(\[]\s*e\s*[)\]](?=\s|$)/gi, " (E)");
  const exento = /\(\s*e\s*\)/i.test(l);
  const marca = l.match(/\(\s*([ra])\s*\)/i);
  const descripcion = l
    .replace(/\(\s*[egra]\s*\)/gi, " ")
    .replace(/[|“”"'`´‘’\[\]{}!;¡¿—–_<>]/g, " ")
    .replace(/^\W+/, "")
    .replace(/\s+/g, " ")
    .trim();
  return {
    descripcion,
    exento,
    ...(marca ? { alicuota: marca[1].toUpperCase() as "R" | "A" } : {}),
    porEmpaque: empaqueDe(descripcion),
    contenido: contenidoDe(descripcion),
  };
}

/** Lee la factura completa a partir de su texto. */
export function parseFactura(texto: string): FacturaLeida {
  const lineas = texto
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 0);
  const out: FacturaLeida = { lineas: [] };

  // Proveedor: el primer RIF de la factura es el del emisor (el del cliente
  // viene después, junto a "Razón social" / "Cliente").
  let idxRif = -1;
  for (let i = 0; i < lineas.length; i++) {
    const m = lineas[i].match(RE_RIF);
    if (m) {
      out.rif = `${m[1].toUpperCase()}-${m[2]}-${m[3]}`;
      idxRif = i;
      break;
    }
  }
  if (!out.rif) {
    for (let i = 0; i < lineas.length; i++) {
      const m = lineas[i].match(RE_ID_FISCAL);
      if (m && /\d{5,}/.test(m[1].replace(/\D/g, ""))) {
        out.rif = m[1].replace(/[.\s]+$/, "");
        idxRif = i;
        break;
      }
    }
  }
  // Nombre: la primera línea con letras de la cabecera que no sea un rótulo.
  const cabecera = lineas.slice(0, Math.max(idxRif + 1, 4));
  for (const l of cabecera) {
    const sinRif = l.replace(RE_RIF, "").replace(/\br\.?\s*i\.?\s*f\.?\s*:?/i, "").trim();
    if (
      /[a-z\u00C0-\u017F]{4,}/i.test(sinRif) &&
      !/^(seniat|factura|invoice|receipt|recibo|ticket|boleta|nota|fecha|date|tel|phone|direc|domicilio|address|av\.|avenida|calle|zona|sector)/i.test(sinRif)
    ) {
      out.proveedorNombre = sinRif.replace(/[,;:\-]+$/, "").trim();
      break;
    }
  }

  // Tipo de documento.
  const todoTexto = lineas.join(" ");
  if (/nota\s+de\s+cr[eé]dito|credit\s+note/i.test(todoTexto)) out.tipo = "nota_credito";
  else if (/nota\s+de\s+d[eé]bito|debit\s+note/i.test(todoTexto)) out.tipo = "nota_debito";
  else if (/nota\s+de\s+entrega|orden\s+de\s+entrega|gu[ií]a\s+de\s+(despacho|remisi[oó]n)|remito|delivery\s+note|packing\s+(slip|list)/i.test(todoTexto))
    out.tipo = "nota_entrega";
  else if (/\bfactura|invoice|boleta|recibo|receipt|ticket|comprobante/i.test(todoTexto)) out.tipo = "factura";

  // N° del documento (no el "N° de control"): factura, invoice, nota de
  // entrega, guía, boleta, recibo, ticket, folio, NCF (Rep. Dominicana),
  // serie-número (Perú: F001-00012345).
  for (const l of lineas) {
    if (/control/i.test(l)) continue;
    const m = l.match(
      /(?:factura|invoice|inv\.?|nota\s+de\s+(?:entrega|cr[eé]dito|d[eé]bito)|orden\s+de\s+entrega|gu[ií]a(?:\s+de\s+\w+)?|boleta|recibo|receipt|ticket|comprobante|folio|documento|ncf)\s*(?:electr[oó]nica\s*)?(?:de\s+venta\s*)?(?:n[°ºo.*]*|nro\.?|num\.?|no\.?|#|\S{1,2}(?=\s*:))?\s*:?\s*([A-Z]{0,4}\d{0,3}-?\d[\d-]{2,})/i,
    );
    if (m) {
      out.numero = m[1].replace(/^-/, "");
      break;
    }
  }

  // Fecha: cada fecha se juzga por su etiqueta, no por la línea entera (en una
  // misma línea pueden venir "Vencimiento: 17/09" y "EMISIÓN: 10/09"). Gana la
  // de emisión; la de vencimiento y la de la imprenta (pie de página) no.
  let mejorFecha: { iso: string; prioridad: number } | null = null;
  // En facturas en inglés (EE. UU.) la fecha numérica es mes/día.
  const enIngles = /\b(invoice|receipt|bill\s+to|amount\s+due|qty|quantity|subtotal)\b/i.test(todoTexto) &&
    !/\b(factura|fecha|cantidad|recibo)\b/i.test(todoTexto);
  const MESES: Record<string, number> = {
    ene: 1, jan: 1, feb: 2, mar: 3, abr: 4, apr: 4, may: 5, jun: 6, jul: 7,
    ago: 8, aug: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12, dec: 12,
  };
  for (const l of lineas) {
    const candidatas: { iso: string; i: number }[] = [];
    // dd/mm/aaaa (o mm/dd/aaaa en inglés).
    for (const m of l.matchAll(new RegExp(RE_FECHA.source, "g"))) {
      let [d, mes] = [Number(m[1]), Number(m[2])];
      if (mes > 12 || (enIngles && d <= 12)) [d, mes] = [mes, d];
      const iso = fechaISO(d, mes, Number(m[3]));
      if (iso) candidatas.push({ iso, i: m.index! });
    }
    // aaaa-mm-dd
    for (const m of l.matchAll(/\b(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})\b/g)) {
      const iso = fechaISO(Number(m[3]), Number(m[2]), Number(m[1]));
      if (iso) candidatas.push({ iso, i: m.index! });
    }
    // "10 de septiembre de 2026", "10-SEP-2026", "10 Sep 2026"
    for (const m of l.matchAll(/\b(\d{1,2})\s*(?:de\s+|[-\/.]\s*)?([a-z]{3})[a-z]*\.?\s*(?:de\s+|del\s+|[-\/.,]\s*)?(\d{4})\b/gi)) {
      const mes = MESES[m[2].toLowerCase()];
      const iso = mes ? fechaISO(Number(m[1]), mes, Number(m[3])) : undefined;
      if (iso) candidatas.push({ iso, i: m.index! });
    }
    // "Sep 10, 2026", "September 10 2026"
    for (const m of l.matchAll(/\b([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/gi)) {
      const mes = MESES[m[1].toLowerCase()];
      const iso = mes ? fechaISO(Number(m[2]), mes, Number(m[3])) : undefined;
      if (iso) candidatas.push({ iso, i: m.index! });
    }
    for (const { iso, i } of candidatas) {
      const etiqueta = l.slice(Math.max(0, i - 28), i).toLowerCase();
      const imprenta = /regi[oó]n|providencia|seniat|desde|hasta|imprenta|gr[aá]fica/i.test(l);
      const prioridad = /emisi[oó]n|emitida|issued?|invoice\s*date|expedici[oó]n/.test(etiqueta)
        ? 4
        : /venc|due|vence|expir|pagar\s+antes|hasta/.test(etiqueta)
          ? 0
          : /fecha|date/.test(etiqueta) && !imprenta
            ? 3
            : imprenta || /res\b|resoluci/.test(etiqueta)
              ? 0.5
              : 1;
      if (!mejorFecha || prioridad > mejorFecha.prioridad) mejorFecha = { iso, prioridad };
    }
  }
  if (mejorFecha) out.fecha = mejorFecha.iso;

  // Moneda: Bs si aparece en la factura; $ si solo hay dólares. Pero si la
  // parte de arriba (encabezado de la tabla de productos) habla en USD y no en
  // Bs, los precios están en dólares aunque los totales traigan también Bs.
  const todo = lineas.join(" ");
  const RE_BS = /\bbs\.?s?\b|\bves\b|bol[ií]vares/gi;
  const RE_USD = /\$|\bus[dg]\b|\busd\w*|d[oó]lares/gi;
  const primerProducto = lineas.findIndex((l, i) => i > idxRif && parseLineaProducto(l) !== null);
  const arriba = lineas.slice(0, primerProducto >= 0 ? primerProducto : lineas.length).join(" ");
  const usdArriba = (arriba.match(RE_USD) ?? []).length;
  const bsArriba = (arriba.match(RE_BS) ?? []).length;
  if (usdArriba > bsArriba) out.moneda = "usd";
  else if (RE_BS.test(todo)) out.moneda = "bs";
  else if (new RegExp(RE_USD.source, "i").test(todo)) out.moneda = "usd";

  // Otras monedas: se avisa (Bolo registra en Bs o $).
  if (!/\bbs\.?s?\b|\bves\b|bol[ií]var/i.test(todo)) {
    const otras: [RegExp, string][] = [
      [/€|\beur\b|\beuros?\b/i, "EUR"],
      [/\bcop\b|\bcol\$/i, "COP"],
      [/\bmxn\b|\bm\.n\./i, "MXN"],
      [/\bpen\b|\bs\/\s?\d|\bsoles\b/i, "PEN"],
      [/\bclp\b/i, "CLP"],
      [/\bars\b/i, "ARS"],
      [/\bbrl\b|r\$/i, "BRL"],
      [/£|\bgbp\b/i, "GBP"],
      [/\bdop\b|rd\$/i, "DOP"],
    ];
    const hallada = otras.find(([re]) => re.test(todo));
    if (hallada && !/\busd\b|us\$/i.test(todo)) out.monedaOtra = hallada[1];
  }

  // Tasa de la propia factura ("Tipo de cambio BCV Bs. 827,7371", "Tasa: 36,50").
  for (const l of lineas) {
    const t = l.match(/(?:tipo\s*de\s*cambio|tasa|exchange\s*rate)[^\d]{0,25}(\d{1,4}(?:[.,]\d{1,6}))/i);
    const v = t ? parseNumero(t[1]) : null;
    if (v && v > 1) {
      out.tasa = v;
      break;
    }
  }

  // Resumen (la fórmula): subtotal, base, IVA, exento, IGTF, descuento, total.
  const totales: { valor: number; prioridad: number }[] = [];
  // Montos de los medios de pago (efectivo, pago móvil, punto…): en un ticket
  // suelen repetir el total aunque la palabra TOTAL no se haya leído.
  const pagos: number[] = [];
  let vioIva = false;
  for (let li = 0; li < lineas.length; li++) {
    const l = lineas[li].replace(/(\d)['’](\d{3})/g, "$1$2");
    if (/\b(efectivo|pago\s*m[oó]vil|punto|tarjeta|d[eé]bito|transferencia|zelle|cash|card)\b/i.test(l)) {
      const m = l.match(/(\d[\d.,]*\d)\s*$/);
      const v = m ? parseNumero(m[1]) : null;
      if (v && v > 0) pagos.push(v);
    }
    // TOTAL sin monto en su renglón: el monto quedó en el renglón vecino.
    if (/^\W*t[o0]t[a4][l1i]\b/i.test(l) && !/\d[.,]\d{2}/.test(l)) {
      for (const vecino of [lineas[li + 1], lineas[li - 1]]) {
        const m = vecino?.match(/^\W*(?:bs\.?\s*|\$\s*)?(\d[\d.,]*\d)\W*$/i);
        const v = m ? parseNumero(m[1]) : null;
        if (v && v > 0) {
          totales.push({ valor: v, prioridad: 2 });
          break;
        }
      }
    }
    // Alícuotas venezolanas por separado: "IVA R 8%", "BI A15,00%".
    const ali = l.match(/\b(?:iva|bi|base)\s*\(?\s*([gra])\s*\)?\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*%/i);
    if (ali) {
      out.alicuotas = { ...out.alicuotas, [ali[1].toUpperCase()]: parseNumero(ali[2]) ?? undefined };
    } else if (/reducid/i.test(l) && /(\d{1,2})\s*%/.test(l)) {
      out.alicuotas = { ...out.alicuotas, R: Number(l.match(/(\d{1,2})\s*%/)![1]) };
    } else if (/adicional|lujo/i.test(l) && /(\d{1,2})\s*%/.test(l)) {
      out.alicuotas = { ...out.alicuotas, A: Number(l.match(/(\d{1,2})\s*%/)![1]) };
    }
    // Números del renglón (sin los porcentajes "16%", "16,00 %").
    const nums = [...l.matchAll(/-?\d[\d.,]*\d|\d/g)]
      .filter((m) => !/^\s*%/.test(l.slice(m.index! + m[0].length)))
      .map((m) => ({ v: parseNumero(m[0]), i: m.index! }))
      .filter((x): x is { v: number; i: number } => x.v !== null);
    if (nums.length === 0) continue;
    // Si el renglón trae Bs y USD, la columna que corresponde a la moneda.
    const mencionaOtra = /\b(ref|usd|divisas?)\b|\$/i.test(l);
    const elegido = out.moneda === "bs" && mencionaOtra && nums.length >= 2 ? nums[0] : nums[nums.length - 1];
    // La etiqueta es lo que está justo antes del número (en una misma fila
    // pueden juntarse dos columnas: "…causará IGTF 3%… Total neto 104,43").
    const etiqueta = l.slice(Math.max(0, elegido.i - 45), elegido.i);
    const tipo = tipoCercano(etiqueta) ?? (nums.length === 1 ? tipoResumen(l) : null);
    // % de IVA: "IVA 16%", "BI G16,00%", "ALICUOTA 16,00 %".
    const pct = l.match(/(?:g\s*)?(\d{1,2}(?:[.,]\d{1,2})?)\s*%/i);
    const porc = pct ? parseNumero(pct[1]) : null;
    const esAlicuotaNoGeneral = !!ali && ali[1].toUpperCase() !== "G";
    if (
      !esAlicuotaNoGeneral &&
      tipoResumen(l) &&
      /iva|base|b\.?\s?i|al[ií]cuota|igv|itbis|itbms|isv|vat|tax|gst|impuesto|mwst|tva/i.test(l) &&
      porc !== null &&
      porc > 0 &&
      out.ivaPorc === undefined
    )
      out.ivaPorc = porc;
    if (tipo === "iva") vioIva = true;
    if (!tipo || tipo === "otro") continue;
    const n = Math.abs(elegido.v);
    // "Neto" después del IVA es el total a pagar (D'limón: Sub-total, IVA, Neto).
    if (tipo === "subtotal" && vioIva && /\bneto\b/i.test(etiqueta)) {
      totales.push({ valor: n, prioridad: 2 });
      continue;
    }
    if (tipo === "total") {
      totales.push({ valor: n, prioridad: /pagar|general|neto|factura|due|grand|importe|monto\s+total|valor\s+total/i.test(etiqueta) ? 2 : 1 });
    } else if (out[tipo] === undefined) {
      out[tipo] = n;
    }
  }
  // El IVA nunca es mayor que la base: si salió así, el OCR tomó otro número
  // de la fila (el "sobre: 74.521,17"); se calcula con la base y el %.
  const baseIva = out.base ?? out.subtotal;
  if (out.iva !== undefined && baseIva !== undefined && out.iva > baseIva) {
    out.iva = out.ivaPorc ? Number(((baseIva * out.ivaPorc) / 100).toFixed(2)) : undefined;
  }
  if (totales.length > 0) {
    const max = Math.max(...totales.map((t) => t.prioridad));
    out.total = totales.filter((t) => t.prioridad === max).pop()!.valor;
  }
  // Sin TOTAL legible: lo dice la fórmula (subtotal + IVA + IGTF) o, si no,
  // el monto que se pagó (efectivo, pago móvil…).
  const calculado =
    (out.subtotal ?? (out.base !== undefined ? out.base + (out.exento ?? 0) : undefined)) !== undefined && out.iva !== undefined
      ? (out.subtotal ?? out.base! + (out.exento ?? 0)) + out.iva + (out.igtf ?? 0)
      : undefined;
  const casiIgual = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.05, b * 0.01);
  if (out.total === undefined) {
    if (calculado !== undefined) out.total = Number(calculado.toFixed(2));
    else if (pagos.length > 0) out.total = Math.max(...pagos);
  } else if (calculado !== undefined && !casiIgual(out.total, calculado)) {
    // Un total leído que no cuadra con la fórmula pero sí con un pago o con la
    // fórmula corriendo la coma: se corrige ("1267418" era 12.674,18).
    const conPago = pagos.find((p) => casiIgual(p, calculado));
    if (conPago !== undefined) out.total = conPago;
    else for (const k of [2, 1, 3]) if (casiIgual(out.total / 10 ** k, calculado)) out.total = Number((out.total / 10 ** k).toFixed(2));
  }

  // Productos (la cabecera del proveedor, hasta su RIF, nunca es un producto).
  // Renglón "cantidad x precio … monto" con la descripción en el renglón de
  // arriba (Inside Market) o en el de abajo (Cold 2024).
  const RE_CXP_MONTO =
    /^\W*(\d+(?:[.,]\d+)?)\s*[x×*%]\s*(?:bs\.?\s*|b5\s*|8s\s*|\$\s*)?(\d[\d.,]*)\s*(\([egra68b]\)|[ct]e\))?\s*(?:\S{0,3}\s+)?(?:bs\.?|8s|b5|re|\$)?\s*(\d[\d.,]*\d)\W*$/i;
  const soloDescripcion = (l: string | undefined) =>
    !!l && /[A-Za-z\u00C0-\u017F]{3,}/.test(l) && !/\d[.,]\d{2}\W*$/.test(l) && !RE_NO_PRODUCTO.test(l) && !esRenglonResumen(l);
  const usadas = new Set<number>();
  for (let i = idxRif + 1; i < lineas.length; i++) {
    const m = lineas[i].match(RE_CXP_MONTO);
    if (!m) continue;
    const marcaEnCant = !!m[3];
    // Si la marca (E)/(G) va con la cantidad, la descripción está arriba; si no, abajo.
    const candidatos = marcaEnCant ? [i - 1, i + 1] : [i + 1, i - 1];
    const j = candidatos.find((k) => k > idxRif && !usadas.has(k) && soloDescripcion(lineas[k]));
    if (j === undefined) continue;
    const cantidad = parseCantidad(m[1]);
    const precio = parseNumero(m[2]);
    const total = parseNumero(m[4]);
    if (!cantidad || !precio || !total) continue;
    const aj = ajustarCantidad(cantidad, precio, total, escritaConDecimales(m[1]));
    const desc = parseLineaSinMonto(lineas[j] + (m[3] ? " " + m[3] : ""));
    usadas.add(i);
    usadas.add(j);
    out.lineas.push({
      ...desc,
      cantidad: aj.cantidad,
      precioUnit: aj.precio,
      total,
      confianza: "alta",
      pesable: escritaConDecimales(m[1]),
    });
  }
  let pendiente: { cantidad: number; precio: number; pesable: boolean; unidad?: UnidadLeida } | null = null;
  for (let i = idxRif + 1; i < lineas.length; i++) {
    if (usadas.has(i)) continue;
    const cx = lineas[i].match(RE_CANT_X_PRECIO);
    if (cx) {
      const cantidad = parseCantidad(cx[1]);
      const precio = parseNumero(cx[3]);
      pendiente =
        cantidad && precio
          ? { cantidad, precio, pesable: escritaConDecimales(cx[1]), unidad: cx[2] ? unidadDeToken(cx[2]) : undefined }
          : null;
      continue;
    }
    const linea = parseLineaProducto(lineas[i]);
    if (linea && pendiente) {
      // La máquina fiscal pone "cantidad x precio" en el renglón de arriba.
      const aj = ajustarCantidad(pendiente.cantidad, pendiente.precio, linea.total, pendiente.pesable);
      linea.cantidad = aj.cantidad;
      linea.precioUnit = aj.precio;
      linea.confianza = "alta";
      linea.pesable = pendiente.pesable || !Number.isInteger(aj.cantidad);
      if (pendiente.unidad) linea.unidadLeida = pendiente.unidad;
    }
    pendiente = null;
    if (linea) out.lineas.push(linea);
  }

  // Nota de entrega / guía de despacho sin precios: si no salió ningún
  // producto con monto, se leen los renglones de cantidad + producto.
  if (out.lineas.length === 0) {
    for (let i = idxRif + 1; i < lineas.length; i++) {
      const linea = parseLineaSinPrecio(lineas[i]);
      if (linea) out.lineas.push(linea);
    }
  }

  // Comas perdidas en un producto: ningún producto puede costar más que la
  // base de toda la factura. Si pasa, al monto le faltan los decimales
  // ("1897" era 18,97): se corre la coma y se rehacen cantidad y precio con
  // los demás números del renglón, también corridos.
  const tope = out.subtotal ?? out.base ?? (out.total ? out.total / (1 + (out.ivaPorc ?? 0) / 100) : undefined);
  if (tope && tope > 0) {
    for (const l of out.lineas) {
      if (l.total <= tope * 1.01) continue;
      const k = [2, 1, 3, 4].find((k) => l.total / 10 ** k <= tope * 1.01);
      if (k === undefined) continue;
      l.total = Number((l.total / 10 ** k).toFixed(2));
      let mejor: { q: number; p: number; desvio: number } | null = null;
      for (const v of l.valores ?? []) {
        for (let kp = 0; kp <= 4; kp++) {
          const p = v / 10 ** kp;
          if (!(p > 0) || p > l.total * 1.01) continue;
          const q = l.total / p;
          const desvio = Math.abs(q - Math.round(q)) / Math.max(1, q);
          if (Math.round(q) >= 1 && Math.round(q) <= 9999 && desvio < 0.0015 && (!mejor || desvio < mejor.desvio))
            mejor = { q: Math.round(q), p, desvio };
        }
      }
      if (mejor) {
        l.cantidad = mejor.q;
        l.precioUnit = mejor.p;
        l.confianza = "alta";
      } else {
        l.cantidad = 1;
        l.precioUnit = l.total;
      }
    }
  }

  // Factura con dos monedas (columnas Bs y USD en el resumen): si los
  // productos suman lo de la columna de la derecha y esa es mucho menor que la
  // de la izquierda, los precios están en dólares.
  if (out.moneda !== "usd" && out.lineas.length > 0) {
    const suma = out.lineas.reduce((s, l) => s + l.total, 0);
    const factorIva = 1 + (out.ivaPorc ?? 0) / 100;
    for (const l of lineas) {
      if (!tipoResumen(l)) continue;
      const nums = [...l.matchAll(/\d[\d.,]*\d/g)]
        .filter((m) => !/^\s*%/.test(l.slice(m.index! + m[0].length)))
        .map((m) => parseNumero(m[0]))
        .filter((v): v is number => v !== null && v > 0);
      if (nums.length < 2) continue;
      const izq = nums[nums.length - 2];
      const der = nums[nums.length - 1];
      // ¿La suma se parece más a la columna de la derecha (USD) que a la de la
      // izquierda (Bs)? Aunque falte un producto, la diferencia es enorme.
      const cerca = (v: number) => Math.min(Math.abs(Math.log(suma / v)), Math.abs(Math.log((suma * factorIva) / v)));
      if (izq / der > 5 && cerca(der) < cerca(izq) && cerca(der) < Math.log(2)) {
        out.moneda = "usd";
        break;
      }
    }
  }

  // Un renglón dudoso cuyo monto es justo un valor del resumen (y los demás
  // productos ya suman ese valor) es un subtotal/total mal rotulado por el OCR.
  const resumen = [out.subtotal, out.base, out.iva, out.exento, out.total].filter(
    (v): v is number => v !== undefined && v > 0,
  );
  const cerca = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.02, b * 0.005);
  out.lineas = out.lineas.filter((l, idx) => {
    if (l.confianza === "alta") return true;
    const igual = resumen.find((v) => cerca(l.total, v));
    if (igual === undefined) return true;
    const otros = out.lineas.reduce((s, o, j) => (j === idx ? s : s + o.total), 0);
    return !(otros > 0 && cerca(otros, igual));
  });
  return out;
}

/** Lo que deberían sumar los productos según la factura (sin IGTF, que no es
 *  costo del insumo). undefined si la factura no trae total. */
export function totalProductos(f: Pick<FacturaLeida, "total" | "igtf">): number | undefined {
  if (f.total === undefined || !(f.total > 0)) return undefined;
  return f.total - (f.igtf ?? 0);
}

/** Qué tan parecidas son dos descripciones (0 a 1), por palabras en común.
 *  Sirve para reconocer un producto aunque el OCR lo lea un poco distinto
 *  cada vez ("PEPSI LIGHT LATA 355X24 UND" ≈ "Pees LIGHT LATA 355X24 UND"). */
export function parecido(a: string, b: string): number {
  const palabras = (s: string) => new Set(normalizarDescripcion(s).split(" ").filter((p) => p.length >= 3));
  const pa = palabras(a);
  const pb = palabras(b);
  if (pa.size === 0 || pb.size === 0) return 0;
  let comunes = 0;
  for (const p of pa) if (pb.has(p)) comunes++;
  return comunes / Math.max(pa.size, pb.size);
}

/** Palabras de solo letras (3 o más), sin los números pegados:
 *  "LAT355x24U" → "lat". */
function palabrasDe(s: string): string[] {
  return normalizarDescripcion(s)
    .split(/[^a-zñ]+/)
    .filter((p) => p.length >= 3 && !["del", "con", "para", "los", "las"].includes(p));
}

/** Dos palabras cuentan como la misma si son iguales, si una empieza con la
 *  otra ("lat" / "lata") o si difieren en una sola letra ("cero" / "zero"). */
function mismaPalabra(a: string, b: string): boolean {
  if (a === b || a.startsWith(b) || b.startsWith(a)) return true;
  if (a.length < 4 || a.length !== b.length) return false;
  let distintas = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && ++distintas > 1) return false;
  return true;
}

// Palabras de empaque o medida: pesan poco al comparar nombres, porque lo que
// distingue un producto es su sabor/variante ("zero", "light"), no si dice
// "lata" o "caja" (la factura y el insumo pueden nombrar distinto el empaque).
const PALABRAS_EMPAQUE = new Set([
  "caja", "cajas", "lata", "latas", "botella", "botellas", "bolsa", "bolsas", "paquete", "paq",
  "bulto", "bultos", "saco", "sacos", "fardo", "fardos", "unidad", "unidades", "und", "unid",
  "carton", "envase", "frasco", "pote", "galon", "kilo", "kilos", "litro", "litros", "sobre",
  "rollo", "docena", "pieza", "piezas", "pet", "vidrio", "tetra", "pack",
]);
const pesoPalabra = (p: string) => (PALABRAS_EMPAQUE.has(p) ? 0.3 : 1);

/** Sugiere el insumo más parecido a una descripción (por palabras en común,
 *  con tolerancia a errores del OCR y a "cero"/"zero"). Solo sugiere si al
 *  menos la mitad de las palabras del nombre del insumo aparecen. `preferir`
 *  da un empujón a un insumo (por ejemplo, el que coincide con el empaque de
 *  la factura) para desempatar entre parecidos. */
export function sugerirInsumo<T extends { id: string; nombre: string }>(
  descripcion: string,
  insumos: T[],
  preferir?: (ins: T) => boolean,
): T | null {
  const palabras = palabrasDe(descripcion);
  if (palabras.length === 0) return null;
  let mejor: T | null = null;
  let mejorPuntaje = 0;
  for (const ins of insumos) {
    const delInsumo = palabrasDe(ins.nombre);
    if (delInsumo.length === 0) continue;
    const coinciden = delInsumo.filter((p) => palabras.some((q) => mismaPalabra(p, q)));
    const comunes = coinciden.length;
    const pesoTotal = delInsumo.reduce((s, p) => s + pesoPalabra(p), 0);
    const cobertura = coinciden.reduce((s, p) => s + pesoPalabra(p), 0) / pesoTotal;
    if (comunes === 0 || cobertura < 0.5) continue;
    const puntaje = cobertura + comunes * 0.01 + (preferir?.(ins) ? 0.5 : 0);
    if (puntaje > mejorPuntaje) {
      mejor = ins;
      mejorPuntaje = puntaje;
    }
  }
  return mejor;
}
