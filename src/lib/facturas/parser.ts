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
};

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
  iva: /\b[i1l]\.?\s*v\.?\s*[a4]\b|\bimpuesto\b|\bal[ií1l]cu[o0]ta\b/i,
  exento: /\bexent[o0]s?\b|\bexoner/i,
  igtf: /\b[i1l]\s*g\s*t\s*f\b/i,
  descuento: /\bdesc(?:uento|to)?\b|\bdscto\b|\brebaja\b/i,
  total: /\bt[o0]t[a4][l1i]\b/i,
};
// Otros renglones que NO son productos aunque terminen en un número.
const RE_NO_PRODUCTO =
  /\b(rif|r\.i\.f|c\.?\s*i\.?|fecha|factura|control|tel[eé]?f?|telf|direcci|domicilio|cliente|raz[oó]n|forma\s*de\s*pago|pago|m[oó]vil|transferencia|cambio|tasa|bcv|ref|son:?|serie|caja|cajer[oa]|vendedor|hora|p[aá]gina|n[°º]|seniat|contribuyente|efectivo|tarjeta|d[eé]bito|cr[eé]dito|punto|divisas?|zelle|vuelto|recibido|items?|art[ií]culos|gracias|firma|contado|vence|vencimiento|condiciones|zona|calle|avenida|av|edif|piso|local|galp[oó]n|sector|urb)\b/i;

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
const RE_CANT_X_PRECIO = /^(\d+(?:[.,]\d+)?)\s*[x×*]\s*(?:bs\.?\s*|\$\s*)?(\d[\d.,]*)$/i;

function fechaISO(d: number, m: number, a: number): string | undefined {
  const anio = a < 100 ? 2000 + a : a;
  if (m < 1 || m > 12 || d < 1 || d > 31 || anio < 2000 || anio > 2100) return undefined;
  return `${anio}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Último número de una línea (para totales: "TOTAL A PAGAR Bs. 1.234,56"). */
function ultimoNumero(linea: string): number | null {
  const tokens = linea.match(/-?[\d][\d.,]*/g);
  if (!tokens) return null;
  for (let i = tokens.length - 1; i >= 0; i--) {
    const n = parseNumero(tokens[i]);
    if (n !== null) return n;
  }
  return null;
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
    .replace(/[|]/g, " ")
    .trim();
  const tokens = limpia.split(/\s+/).filter(Boolean);
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
  if (tokens.length > 1 && /^\d{1,4}([.,]\d{1,3})?$/.test(tokens[0])) {
    cantInicial = parseNumero(tokens[0]);
    tokens.shift();
  }
  // Código interno largo al inicio ("7591002000011 HARINA…", "A-1023 HARINA…").
  if (tokens.length > 1 && /\d/.test(tokens[0]) && tokens[0].replace(/[^0-9]/g, "").length >= 4 && !/(kg|gr?|ml|lt?)$/i.test(tokens[0])) {
    tokens.shift();
    if (cantInicial === null && tokens.length > 1 && /^\d{1,4}([.,]\d{1,3})?$/.test(tokens[0])) {
      cantInicial = parseNumero(tokens[0]);
      tokens.shift();
    }
  }
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
      cantidad = cantInicial ?? previos[0];
      precioUnit = cantidad > 0 ? total / cantidad : undefined;
    }
  } else if (finales.length === 2) {
    const [a] = finales;
    if (cantInicial !== null) {
      precioUnit = a;
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
  return { descripcion, cantidad, precioUnit, total, exento, confianza: finales.length >= 2 ? "alta" : "baja" };
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
      (sinRif.match(/[a-zñ]/gi) ?? []).length >= 3 &&
      !/^(seniat|factura|fecha|tel|direc|domicilio|av\.|avenida|calle|zona|sector)/i.test(sinRif)
    ) {
      out.proveedorNombre = sinRif.replace(/[,;:\-]+$/, "").trim();
      break;
    }
  }

  // N° de factura (no el "N° de control").
  for (const l of lineas) {
    if (/control/i.test(l)) continue;
    const m = l.match(/factura\s*(?:n[°ºo.*]*|nro\.?|num\.?|#)?\s*:?\s*([A-Z]{0,3}-?\d[\d-]{2,})/i);
    if (m) {
      out.numero = m[1].replace(/^-/, "");
      break;
    }
  }

  // Fecha: preferimos la de una línea que diga "fecha" (no la de vencimiento).
  const conFecha = lineas.filter((l) => RE_FECHA.test(l));
  const preferida =
    conFecha.find((l) => /fecha/i.test(l) && !/venc/i.test(l)) ?? conFecha.find((l) => !/venc/i.test(l));
  if (preferida) {
    const m = preferida.match(RE_FECHA)!;
    out.fecha = fechaISO(Number(m[1]), Number(m[2]), Number(m[3]));
  }

  // Moneda: Bs si aparece en la factura; $ si solo hay dólares.
  const todo = lineas.join(" ");
  if (/\bbs\.?s?\b|\bves\b|bol[ií]vares/i.test(todo)) out.moneda = "bs";
  else if (/\$|\busd\b|d[oó]lares/i.test(todo)) out.moneda = "usd";

  // Resumen (la fórmula): subtotal, base, IVA, exento, IGTF, descuento, total.
  const totales: { valor: number; prioridad: number }[] = [];
  for (const l of lineas) {
    const tipo = tipoResumen(l);
    if (!tipo) continue;
    // % de IVA: "IVA 16%", "BI G16,00%", "ALICUOTA 16,00 %".
    const pct = l.match(/(?:g\s*)?(\d{1,2}(?:[.,]\d{1,2})?)\s*%/i);
    const porc = pct ? parseNumero(pct[1]) : null;
    if ((tipo === "iva" || tipo === "base") && porc !== null && porc > 0 && out.ivaPorc === undefined) out.ivaPorc = porc;
    let n = ultimoNumero(l);
    if (n === null) continue;
    if (porc !== null && n === porc) continue; // solo traía el %
    n = Math.abs(n);
    if (tipo === "total") {
      // Un total en dólares de referencia no cuenta si la factura es en Bs.
      if (/\b(ref|usd|divisa)\b|\$/i.test(l) && /\bbs\.?s?\b|bol[ií]var/i.test(lineas.join(" "))) continue;
      totales.push({ valor: n, prioridad: /pagar|general|neto|factura/i.test(l) ? 2 : 1 });
    } else if (out[tipo] === undefined) {
      out[tipo] = n;
    }
  }
  if (totales.length > 0) {
    const max = Math.max(...totales.map((t) => t.prioridad));
    out.total = totales.filter((t) => t.prioridad === max).pop()!.valor;
  }

  // Productos (la cabecera del proveedor, hasta su RIF, nunca es un producto).
  let pendiente: { cantidad: number; precio: number } | null = null;
  for (let i = idxRif + 1; i < lineas.length; i++) {
    const cx = lineas[i].match(RE_CANT_X_PRECIO);
    if (cx) {
      const cantidad = parseNumero(cx[1]);
      const precio = parseNumero(cx[2]);
      pendiente = cantidad && precio ? { cantidad, precio } : null;
      continue;
    }
    const linea = parseLineaProducto(lineas[i]);
    if (linea && pendiente) {
      // La máquina fiscal pone "cantidad x precio" en el renglón de arriba.
      linea.cantidad = pendiente.cantidad;
      linea.precioUnit = pendiente.precio;
      linea.confianza = "alta";
    }
    pendiente = null;
    if (linea) out.lineas.push(linea);
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
