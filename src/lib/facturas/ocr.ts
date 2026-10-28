// OCR en el propio dispositivo (Tesseract compilado para el navegador). La foto
// NUNCA sale del teléfono: se limpia y se lee aquí, y a Bolo solo llegan los
// datos que la persona confirma en el preview. Sin APIs ni cobros.
//
// La primera vez el navegador descarga el motor y los idiomas español e inglés (unos MB)
// y los guarda; las siguientes lecturas arrancan directo.

import type { Worker } from "tesseract.js";

type Progreso = (etapa: string, porcentaje: number) => void;

let workerPromesa: Promise<Worker> | null = null;
let alProgresar: Progreso | null = null;

const ETAPAS: Record<string, string> = {
  "loading tesseract core": "Preparando el lector",
  "initializing tesseract": "Preparando el lector",
  "loading language traineddata": "Descargando los idiomas (solo la primera vez)",
  "initializing api": "Preparando el lector",
  "recognizing text": "Leyendo la factura",
};

function obtenerWorker(): Promise<Worker> {
  if (!workerPromesa) {
    workerPromesa = (async () => {
      const { createWorker } = await import("tesseract.js");
      // Español e inglés: las facturas de importadores y cadenas vienen en ambos.
      return createWorker(["spa", "eng"], 1, {
        logger: (m: { status: string; progress: number }) => {
          alProgresar?.(ETAPAS[m.status] ?? "Preparando el lector", Math.round((m.progress ?? 0) * 100));
        },
      });
    })();
    // Si falla (sin internet la primera vez), permitir reintentar.
    workerPromesa.catch(() => {
      workerPromesa = null;
    });
  }
  return workerPromesa;
}

/** Error con un mensaje para la persona (no técnico). */
export class FotoIlegible extends Error {}

function esHeic(archivo: Blob): boolean {
  const nombre = archivo instanceof File ? archivo.name.toLowerCase() : "";
  return /heic|heif/i.test(archivo.type) || nombre.endsWith(".heic") || nombre.endsWith(".heif");
}

/** Deja la foto en un formato que cualquier navegador abre. Las fotos del
 *  iPhone pasadas a la computadora vienen en HEIC, que Chrome no sabe abrir:
 *  se convierten a JPG aquí mismo (sin subirlas a ningún lado). El resultado
 *  sirve tanto para leerla como para mostrarla junto al formulario. */
export async function prepararFoto(archivo: Blob): Promise<Blob> {
  if (archivo.type === "application/pdf" || (archivo instanceof File && archivo.name.toLowerCase().endsWith(".pdf"))) {
    throw new FotoIlegible("Por ahora el lector trabaja con fotos (JPG, PNG o HEIC), no con PDF. Haz una captura de pantalla del PDF y elige esa imagen.");
  }
  if (!esHeic(archivo)) return archivo;
  try {
    const { default: heic2any } = await import("heic2any");
    const jpg = await heic2any({ blob: archivo, toType: "image/jpeg", quality: 0.9 });
    return Array.isArray(jpg) ? jpg[0] : jpg;
  } catch {
    // Safari sí abre HEIC por su cuenta: se intenta igual con el original.
    return archivo;
  }
}

/** Abre la imagen probando, en orden, las formas que soportan los distintos
 *  navegadores (algunos no aceptan enderezar con EXIF, otros solo abren con
 *  <img>). */
async function abrirImagen(archivo: Blob): Promise<{ img: CanvasImageSource; w: number; h: number; liberar: () => void }> {
  try {
    const b = await createImageBitmap(archivo, { imageOrientation: "from-image" });
    return { img: b, w: b.width, h: b.height, liberar: () => b.close() };
  } catch {
    /* siguiente forma */
  }
  try {
    const b = await createImageBitmap(archivo);
    return { img: b, w: b.width, h: b.height, liberar: () => b.close() };
  } catch {
    /* siguiente forma */
  }
  const url = URL.createObjectURL(archivo);
  try {
    const el = new Image();
    el.src = url;
    await el.decode();
    return { img: el, w: el.naturalWidth, h: el.naturalHeight, liberar: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new FotoIlegible(
      esHeic(archivo)
        ? "No se pudo abrir la foto HEIC en este navegador. Prueba con Safari, o expórtala como JPG."
        : "Este navegador no pudo abrir la imagen. Prueba con una foto JPG o PNG.",
    );
  }
}

/** Limpia la foto antes de leerla: la endereza según el teléfono (EXIF), la
 *  lleva a un tamaño que el OCR lee bien, la pasa a escala de grises y estira el
 *  contraste (papel más blanco, tinta más negra). */
export async function limpiarFoto(archivo: Blob): Promise<HTMLCanvasElement> {
  const { img: imagen, w: anchoImg, h: altoImg, liberar } = await abrirImagen(archivo);
  // ~3200 px en el lado largo: las facturas en tabla traen letra pequeña y con
  // menos detalle el OCR no la lee; más grande ya solo hace lento al teléfono.
  const objetivo = 3200;
  const escala = Math.min(2, objetivo / Math.max(anchoImg, altoImg));
  const w = Math.round(anchoImg * escala);
  const h = Math.round(altoImg * escala);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new FotoIlegible("Este navegador no puede procesar imágenes.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(imagen, 0, 0, w, h);
  liberar();

  const img = ctx.getImageData(0, 0, w, h);
  const px = img.data;
  // Grises + histograma para estirar el contraste entre el 2% y el 98%.
  const hist = new Uint32Array(256);
  for (let i = 0; i < px.length; i += 4) {
    const g = Math.round(px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114);
    px[i] = g;
    hist[g]++;
  }
  const total = w * h;
  let acum = 0;
  let bajo = 0;
  let alto = 255;
  for (let v = 0; v < 256; v++) {
    acum += hist[v];
    if (acum <= total * 0.02) bajo = v;
    if (acum <= total * 0.98) alto = v;
  }
  const rango = Math.max(1, alto - bajo);
  for (let i = 0; i < px.length; i += 4) {
    const v = Math.max(0, Math.min(255, ((px[i] - bajo) * 255) / rango));
    px[i] = px[i + 1] = px[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Prepara la foto para leer tablas: blanco y negro por zonas (umbral
 *  adaptativo de Bradley, para que el papel de color, las sombras y los
 *  encabezados con fondo no confundan al OCR) y sin los bordes de la tabla
 *  (líneas largas horizontales y verticales, que el OCR lee como basura). */
function paraLeer(origen: HTMLCanvasElement): HTMLCanvasElement {
  const W = origen.width;
  const H = origen.height;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return origen;
  ctx.drawImage(origen, 0, 0);
  const im = ctx.getImageData(0, 0, W, H);
  const px = im.data;
  // Imagen integral de grises (Uint32 alcanza: 255 × 6 M px < 4.300 M).
  const I = new Uint32Array((W + 1) * (H + 1));
  for (let y = 1; y <= H; y++) {
    let fila = 0;
    for (let x = 1; x <= W; x++) {
      fila += px[((y - 1) * W + x - 1) * 4];
      I[y * (W + 1) + x] = I[(y - 1) * (W + 1) + x] + fila;
    }
  }
  const r = Math.max(8, Math.round(Math.max(W, H) / 80));
  const tinta = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(H - 1, y + r);
    for (let x = 0; x < W; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(W - 1, x + r);
      const n = (x1 - x0 + 1) * (y1 - y0 + 1);
      const suma = I[(y1 + 1) * (W + 1) + x1 + 1] - I[y0 * (W + 1) + x1 + 1] - I[(y1 + 1) * (W + 1) + x0] + I[y0 * (W + 1) + x0];
      // Más oscuro que el 85 % del promedio de su zona = tinta.
      tinta[y * W + x] = px[(y * W + x) * 4] * n < suma * 0.85 ? 1 : 0;
    }
  }
  // Alto de letra de ESTA foto: los tramos verticales de tinta más largos que
  // se repiten (los palos de las letras). Las líneas de tabla son pocas.
  const tramos: number[] = [];
  for (let x = 0; x < W; x += 3) {
    let ini = -1;
    for (let y = 0; y <= H; y++) {
      const on = y < H && tinta[y * W + x] === 1;
      if (on && ini < 0) ini = y;
      if (!on && ini >= 0) {
        if (y - ini >= 3) tramos.push(y - ini);
        ini = -1;
      }
    }
  }
  tramos.sort((a, b) => a - b);
  const altoLetra = Math.max(8, tramos.length ? tramos[Math.floor(tramos.length * 0.9)] : 20);
  // Borrar líneas: tramos de tinta varias veces más largos que una letra. Los
  // bordes de una tabla cruzan varias filas o todo el ancho; un trazo de
  // letra, sea la letra chica o grande, nunca llega.
  const limpio = tinta.slice();
  const largoH = Math.round(altoLetra * 6);
  const largoV = Math.round(altoLetra * 3.5);
  for (let y = 0; y < H; y++) {
    let ini = -1;
    for (let x = 0; x <= W; x++) {
      const on = x < W && tinta[y * W + x] === 1;
      if (on && ini < 0) ini = x;
      if (!on && ini >= 0) {
        if (x - ini >= largoH) for (let k = ini; k < x; k++) limpio[y * W + k] = 0;
        ini = -1;
      }
    }
  }
  for (let x = 0; x < W; x++) {
    let ini = -1;
    for (let y = 0; y <= H; y++) {
      const on = y < H && tinta[y * W + x] === 1;
      if (on && ini < 0) ini = y;
      if (!on && ini >= 0) {
        if (y - ini >= largoV) for (let k = ini; k < y; k++) limpio[k * W + x] = 0;
        ini = -1;
      }
    }
  }
  for (let i = 0; i < limpio.length; i++) {
    const v = limpio[i] ? 0 : 255;
    px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = v;
    px[i * 4 + 3] = 255;
  }
  ctx.putImageData(im, 0, 0);
  return c;
}

type Caja = { x0: number; y0: number; x1: number; y1: number };
type Palabra = { text: string; bbox: Caja };
/** Un trozo de línea que el OCR ya leyó junto (una celda, una frase). */
type Trozo = { texto: string; x0: number; x1: number; yIzq: number; yDer: number };

const centro = (b: Caja) => (b.y0 + b.y1) / 2;

/** Arma las filas de la factura a partir de los trozos de texto y su posición:
 *  los que están a la misma altura son una fila, de izquierda a derecha. Así
 *  una tabla (descripción, cantidad, precio, subtotal en columnas) se lee como
 *  renglones, sea cual sea su diseño.
 *
 *  La foto casi nunca está perfectamente derecha: cada trozo se compara con el
 *  FINAL de la fila (el trozo más cercano a su izquierda), así la fila "sigue"
 *  la inclinación aunque la hoja sea ancha. */
function filasDeTrozos(trozos: Trozo[], alto: number): string[] {
  const ts = [...trozos].sort((a, b) => a.x0 - b.x0);
  const filas: { yIni: number; yFin: number; xFin: number; ts: Trozo[] }[] = [];
  for (const t of ts) {
    let mejor: (typeof filas)[number] | null = null;
    let dist = Infinity;
    for (const f of filas) {
      if (f.xFin > t.x0 + alto) continue; // ya tiene algo encima de este trozo
      // Cuanto más lejos a la izquierda termina la fila, más inclinación se tolera.
      const tolerancia = alto * 0.5 + (t.x0 - f.xFin) * 0.03;
      const d = Math.abs(f.yFin - t.yIzq);
      if (d < tolerancia && d < dist) {
        mejor = f;
        dist = d;
      }
    }
    if (mejor) {
      mejor.ts.push(t);
      mejor.yFin = t.yDer;
      mejor.xFin = t.x1;
    } else filas.push({ yIni: t.yIzq, yFin: t.yDer, xFin: t.x1, ts: [t] });
  }
  return filas.sort((a, b) => a.yIni - b.yIni).map((f) => f.ts.map((t) => t.texto).join(" "));
}

/** Gira un canvas 90, 180 o 270 grados (sentido horario). */
function rotar(origen: HTMLCanvasElement, grados: number, maxLado = Infinity): HTMLCanvasElement {
  const escala = Math.min(1, maxLado / Math.max(origen.width, origen.height));
  const w = Math.round(origen.width * escala);
  const h = Math.round(origen.height * escala);
  const deLado = grados === 90 || grados === 270;
  const c = document.createElement("canvas");
  c.width = deLado ? h : w;
  c.height = deLado ? w : h;
  const ctx = c.getContext("2d");
  if (!ctx) return origen;
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((grados * Math.PI) / 180);
  ctx.drawImage(origen, -w / 2, -h / 2, w, h);
  return c;
}

/** Qué tan "legible" salió un texto: confianza del OCR por la cantidad de
 *  palabras y números reales. Una foto de lado da basura con pocas palabras. */
const VOCABULARIO = new Set([
  "factura", "total", "subtotal", "subttl", "fecha", "hora", "rif", "iva", "exento", "seniat", "base",
  "imponible", "cantidad", "precio", "descripcion", "efectivo", "pago", "cliente", "nota", "entrega",
  "control", "monto", "neto", "contado", "caracas", "invoice", "date", "qty", "amount", "tax", "due",
]);
function puntaje(texto: string, confianza: number): number {
  const tokens = texto.split(/\s+/).filter(Boolean);
  const buenos = tokens.filter((t) => /^[A-Za-z\u00C0-\u017F]{3,}[.,:]?$/.test(t) || /^\d[\d.,]*$/.test(t)).length;
  // Las palabras típicas de una factura casi nunca salen de una foto mal girada.
  const deFactura = tokens.filter((t) =>
    VOCABULARIO.has(
      t
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z]/g, ""),
    ),
  ).length;
  return (confianza / 100) * buenos + 6 * deFactura;
}

/** Lee una foto de factura y devuelve su texto y cuánto hubo que girarla.
 *  Sirve sin importar cómo se tomó la foto: si la primera lectura (rápida, con
 *  la foto reducida) sale mal, prueba girada 90°, 270° y 180° y se queda con la
 *  que mejor se lee. `rotateAuto` además corrige las fotos un poco torcidas. */
export async function leerFactura(
  archivo: Blob,
  onProgreso?: Progreso,
): Promise<{ texto: string; giro: number }> {
  alProgresar = onProgreso ?? null;
  try {
    onProgreso?.("Limpiando la foto", 0);
    // (Un recorte automático de la hoja por zonas claras se probó con el banco
    // de fotos reales y empeoró la lectura: cortaba texto en sombra. Queda
    // pendiente hacerlo con detección de bordes.)
    const canvas = await limpiarFoto(archivo);
    const worker = await obtenerWorker();

    // Lectura rápida para saber si la foto está derecha.
    const etapaGiro: Progreso = (_e, p) => onProgreso?.("Buscando cómo está girada la foto", p);
    alProgresar = etapaGiro;
    // Modo 6 (un bloque de texto): con la foto de lado da basura a propósito,
    // y así se nota que hay que girarla (el modo automático lee algo igual).
    await worker.setParameters({ tessedit_pageseg_mode: "6" as never });
    const prueba = async (grados: number) => {
      const { data } = await worker.recognize(rotar(canvas, grados, 1400));
      return puntaje(data.text ?? "", data.confidence ?? 0);
    };
    let giro = 0;
    let mejor = await prueba(0);
    // Derecha y bien leída: no hace falta probar más.
    if (mejor < 30) {
      for (const g of [90, 270, 180]) {
        const p = await prueba(g);
        if (p > mejor * 1.3 + 3) {
          mejor = p;
          giro = g;
        }
      }
    }

    // Lectura completa: foto derecha, en blanco y negro y sin bordes de tabla;
    // el OCR busca texto suelto por toda la hoja (modo 11, sirve para tablas y
    // tickets) y las filas se arman por la posición de cada palabra.
    alProgresar = (_e, p) => onProgreso?.("Leyendo la factura", p);
    await worker.setParameters({ tessedit_pageseg_mode: "11" as never });
    const lista = paraLeer(giro ? rotar(canvas, giro) : canvas);
    const { data } = await worker.recognize(lista, {}, { blocks: true, text: true });
    const trozos: Trozo[] = [];
    const alturas: number[] = [];
    for (const b of data.blocks ?? [])
      for (const p of b.paragraphs)
        for (const l of p.lines) {
          const ws: Palabra[] = l.words.filter((w) => w.text.trim());
          if (ws.length === 0) continue;
          for (const w of ws) alturas.push(w.bbox.y1 - w.bbox.y0);
          trozos.push({
            texto: ws.map((w) => w.text).join(" "),
            x0: ws[0].bbox.x0,
            x1: ws[ws.length - 1].bbox.x1,
            yIzq: centro(ws[0].bbox),
            yDer: centro(ws[ws.length - 1].bbox),
          });
        }
    alturas.sort((a, b) => a - b);
    const filas = filasDeTrozos(trozos, alturas[Math.floor(alturas.length / 2)] || 20);
    return { texto: filas.length > 0 ? filas.join("\n") : (data.text ?? ""), giro };
  } finally {
    alProgresar = null;
  }
}

/** La misma foto girada (en color), para mostrarla derecha junto al
 *  formulario. Devuelve la original si no hace falta girarla. */
export async function fotoDerecha(archivo: Blob, giro: number): Promise<Blob> {
  if (!giro) return archivo;
  const { img, w, h, liberar } = await abrirImagen(archivo);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d")?.drawImage(img, 0, 0);
  liberar();
  const girada = rotar(c, giro, 2000);
  return new Promise((ok) => girada.toBlob((b) => ok(b ?? archivo), "image/jpeg", 0.85));
}
