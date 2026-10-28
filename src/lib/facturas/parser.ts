// Lector de facturas: convierte el TEXTO de una factura (lo que devuelve el OCR,
// o lo que se pegue a mano) en campos de compra. Reglas pensadas para facturas
// venezolanas: RIF, N° de factura, fecha dd/mm/aaaa, montos "1.234,56", IVA y
// productos exentos marcados con (E).
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
  /** Los demás números del renglón (para corregir comas perdidas con el
   *  resumen de la factura). Uso interno del lector. */
  valores?: number[];
  /** Unidad de la cantidad cuando la factura la escribe ("1,1895 KG x",
   *  "CARNE DE RES KG", "500 GR"). No confundir con la presentación pegada al
   *  nombre ("HARINA PAN 1KG" es el tamaño del paquete). */
  unidadLeida?: UnidadLeida;
};

export type UnidadLeida = "kg" | "g" | "L" | "ml" | "unidad";

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
  lineas: LineaLeida[];
};

/** Minúsculas, sin acentos, sin signos y con un solo espacio. Es la llave con
 *  la que se recuerdan las equivalencias ("Harina P.A.N. 1Kg" = "harina pan 1kg"). */
export function normalizarDescripcion(s: string): string {
  // ̀-ͯ: tildes separadas por NFD (con código, no literal: el
  // minificador puede corromper el carácter).
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
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
    // Convención venezolana: "1.500" son mil quinientos; "12.50" es decimal.
    s = partes.length > 2 || (dec.length === 3 && partes[0] !== "0") ? partes.join("") : s;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const RE_RIF = /\b([JVEGPC])\s*[-.]?\s*(\d{6,9})\s*[-.]?\s*(\d)\b/i;
const RE_FECHA = /\b(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{2,4})\b/;
// ── La "fórmula" de la factura venezolana ──
// Renglones de resumen: subtotal, base imponible, IVA, exento, IGTF, descuento
// y total. Tolerantes a lo que suele confundir el OCR (0↔O, 1↔I↔L, 4↔A):
// "SUB-T0TAL", "1.V.A", "BI G16,00%", "SUBTTL".
const RE_RESUMEN = {
  subtotal: /\bs[uv]b\s*[-.]?\s*t[o0]t(?:[a4][l1i])?\b|\bsubttl\b|\bsub\s*[-.]?\s*ttl\b/i,
  base: /(?:^|\s)b\.?\s?[i1l]\.?(?=\s|$)|\bbi\s*g\s*\d|\bbase\b|\bimp[o0]nible\b/i,
  iva: /\b[i1l]\.?\s*v\.?\s*[a4]\b|(?:^|\s)v\.?\s*a\s*\d{1,2}(?:[.,]\d+)?\s*%|\bimpuesto\b|\bal[ií1l]cu[o0]ta\b|%\s*sobre\b/i,
  exento: /\bexent[o0]s?\b|\bexoner/i,
  igtf: /\b[i1l]\s*g\s*t\s*f\b/i,
  descuento: /\bdesc(?:uento|to)?\b|\bdscto\b|\brebaja\b/i,
  total: /\bt[o0]t[a4][l1i]\b|\ba\s+pagar\b/i,
};
// Otros renglones que NO son productos aunque terminen en un número.
const RE_NO_PRODUCTO =
  /\b(rif|r\.i\.f|c\.?\s*i\.?|fecha|factura|control|tel[eé]?f?|telf|direcci|domicilio|cliente|raz[oó]n|forma\s*de\s*pago|pago|m[oó]vil|transferencia|cambio|tasa|bcv|ref|son:?|serie|caja|cajer[oa]|vendedor|hora|p[aá]gina|n[°º]|seniat|contribuyente|efectivo|tarjeta|d[eé]bito|cr[eé]dito|punto|divisas?|zelle|vuelto|recibido|items?|art[ií]culos|gracias|firma|contado|vence|vencimiento|condiciones|zona|calle|avenida|av|edif|piso|local|galp[oó]n|sector|urb|aceptamos|billetes|deteriorados|condiciones|plazo|conforme|despach\w*|conductor|placas?|veh[ií]culo|sello|envases|entregados|recibidos|original|copia)\b/i;

/** Qué parte de la fórmula es un renglón (o null si no es de resumen). */
export function tipoResumen(linea: string): keyof typeof RE_RESUMEN | null {
  if (RE_RESUMEN.subtotal.test(linea)) return "subtotal";
  if (RE_RESUMEN.igtf.test(linea)) return "igtf";
  if (RE_RESUMEN.base.test(linea)) return "base";
  if (RE_RESUMEN.exento.test(linea) && !/\(\s*e\s*\)/i.test(linea)) return "exento";
  if (RE_RESUMEN.iva.test(linea)) return "iva";
  if (RE_RESUMEN.descuento.test(linea)) return "descuento";
  if (RE_RESUMEN.total.test(linea)) return "total";
  return null;
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
export function parseLineaProducto(linea: string): LineaLeida | null {
  if (tipoResumen(linea) || RE_NO_PRODUCTO.test(linea)) return null;
  const exento = /\(\s*e\s*\)|\s\*?E$/i.test(linea);
  const limpia = linea
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
  // La descripción no termina en números sueltos ni en ruido de una letra
  // (son columnas que el OCR no pudo leer bien: "… UND 10 2 0.355 8.52 o").
  while (tokens.length > 1 && (/^[\d.,]+$/.test(tokens[tokens.length - 1]) || tokens[tokens.length - 1].length <= 1))
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
    valores: finales.slice(0, -1),
    ...(unidadLeida ? { unidadLeida } : {}),
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
  // Nombre: la primera línea con letras de la cabecera que no sea un rótulo.
  const cabecera = lineas.slice(0, Math.max(idxRif + 1, 4));
  for (const l of cabecera) {
    const sinRif = l.replace(RE_RIF, "").replace(/\br\.?\s*i\.?\s*f\.?\s*:?/i, "").trim();
    if (
      /[a-z\u00C0-\u017F]{4,}/i.test(sinRif) &&
      !/^(seniat|factura|fecha|tel|direc|domicilio|av\.|avenida|calle|zona|sector)/i.test(sinRif)
    ) {
      out.proveedorNombre = sinRif.replace(/[,;:\-]+$/, "").trim();
      break;
    }
  }

  // N° de factura (no el "N° de control").
  for (const l of lineas) {
    if (/control/i.test(l)) continue;
    const m = l.match(/factura\s*(?:n[°ºo.*]*|nro\.?|num\.?|#|\S{1,2}(?=\s*:))?\s*:?\s*([A-Z]{0,3}-?\d[\d-]{2,})/i);
    if (m) {
      out.numero = m[1].replace(/^-/, "");
      break;
    }
  }

  // Fecha: cada fecha se juzga por su etiqueta, no por la línea entera (en una
  // misma línea pueden venir "Vencimiento: 17/09" y "EMISIÓN: 10/09"). Gana la
  // de emisión; la de vencimiento y la de la imprenta (pie de página) no.
  let mejorFecha: { iso: string; prioridad: number } | null = null;
  for (const l of lineas) {
    const re = new RegExp(RE_FECHA.source, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(l))) {
      const iso = fechaISO(Number(m[1]), Number(m[2]), Number(m[3]));
      if (!iso) continue;
      const etiqueta = l.slice(Math.max(0, m.index - 28), m.index).toLowerCase();
      const imprenta = /regi[oó]n|providencia|seniat|desde|hasta|imprenta|gr[aá]fica/i.test(l);
      const prioridad = /emisi[oó]n|emitida/.test(etiqueta)
        ? 4
        : /venc/.test(etiqueta)
          ? 0
          : /fecha/.test(etiqueta) && !imprenta
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

  // Tasa de la propia factura ("Tipo de cambio BCV Bs. 827,7371", "Tasa: 36,50").
  for (const l of lineas) {
    const t = l.match(/(?:tipo\s*de\s*cambio|tasa)[^\d]{0,25}(\d{1,4}(?:[.,]\d{1,6}))/i);
    const v = t ? parseNumero(t[1]) : null;
    if (v && v > 1) {
      out.tasa = v;
      break;
    }
  }

  // Resumen (la fórmula): subtotal, base, IVA, exento, IGTF, descuento, total.
  const totales: { valor: number; prioridad: number }[] = [];
  for (const l of lineas) {
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
    const tipo = tipoResumen(etiqueta) ?? (nums.length === 1 ? tipoResumen(l) : null);
    // % de IVA: "IVA 16%", "BI G16,00%", "ALICUOTA 16,00 %".
    const pct = l.match(/(?:g\s*)?(\d{1,2}(?:[.,]\d{1,2})?)\s*%/i);
    const porc = pct ? parseNumero(pct[1]) : null;
    if (tipoResumen(l) && /iva|base|b\.?\s?i|al[ií]cuota/i.test(l) && porc !== null && porc > 0 && out.ivaPorc === undefined)
      out.ivaPorc = porc;
    if (!tipo) continue;
    const n = Math.abs(elegido.v);
    if (tipo === "total") {
      totales.push({ valor: n, prioridad: /pagar|general|neto|factura/i.test(etiqueta) ? 2 : 1 });
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

  // Productos (la cabecera del proveedor, hasta su RIF, nunca es un producto).
  let pendiente: { cantidad: number; precio: number; pesable: boolean; unidad?: UnidadLeida } | null = null;
  for (let i = idxRif + 1; i < lineas.length; i++) {
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

/** Sugiere el insumo más parecido a una descripción (por palabras en común).
 *  Solo devuelve una sugerencia si al menos la mitad de las palabras del nombre
 *  del insumo aparecen en la descripción. */
export function sugerirInsumo<T extends { id: string; nombre: string }>(
  descripcion: string,
  insumos: T[],
): T | null {
  const palabras = new Set(
    normalizarDescripcion(descripcion)
      .split(" ")
      .filter((p) => p.length >= 3 && !/^\d/.test(p)),
  );
  if (palabras.size === 0) return null;
  let mejor: T | null = null;
  let mejorPuntaje = 0;
  for (const ins of insumos) {
    const delInsumo = normalizarDescripcion(ins.nombre)
      .split(" ")
      .filter((p) => p.length >= 3 && !/^\d/.test(p) && !["de", "del", "con", "para"].includes(p));
    if (delInsumo.length === 0) continue;
    const comunes = delInsumo.filter((p) => palabras.has(p) || [...palabras].some((q) => q.startsWith(p) || p.startsWith(q))).length;
    const puntaje = comunes / delInsumo.length + comunes * 0.01;
    if (comunes > 0 && puntaje > mejorPuntaje) {
      mejor = ins;
      mejorPuntaje = puntaje;
    }
  }
  return mejorPuntaje >= 0.5 ? mejor : null;
}
