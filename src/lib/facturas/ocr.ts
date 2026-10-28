// OCR en el propio dispositivo (Tesseract compilado para el navegador). La foto
// NUNCA sale del teléfono: se limpia y se lee aquí, y a Bolo solo llegan los
// datos que la persona confirma en el preview. Sin APIs ni cobros.
//
// La primera vez el navegador descarga el motor y el idioma español (unos MB)
// y los guarda; las siguientes lecturas arrancan directo.

import type { Worker } from "tesseract.js";

type Progreso = (etapa: string, porcentaje: number) => void;

let workerPromesa: Promise<Worker> | null = null;
let alProgresar: Progreso | null = null;

const ETAPAS: Record<string, string> = {
  "loading tesseract core": "Preparando el lector",
  "initializing tesseract": "Preparando el lector",
  "loading language traineddata": "Descargando el idioma (solo la primera vez)",
  "initializing api": "Preparando el lector",
  "recognizing text": "Leyendo la factura",
};

function obtenerWorker(): Promise<Worker> {
  if (!workerPromesa) {
    workerPromesa = (async () => {
      const { createWorker } = await import("tesseract.js");
      return createWorker("spa", 1, {
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
  // ~2000 px en el lado largo: suficiente detalle sin hacer lento al teléfono.
  const objetivo = 2000;
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

/** Lee una foto de factura y devuelve su texto. `rotateAuto` endereza las fotos
 *  tomadas un poco torcidas. */
export async function leerFactura(archivo: Blob, onProgreso?: Progreso): Promise<string> {
  alProgresar = onProgreso ?? null;
  try {
    onProgreso?.("Limpiando la foto", 0);
    const canvas = await limpiarFoto(archivo);
    const worker = await obtenerWorker();
    const { data } = await worker.recognize(canvas, { rotateAuto: true });
    return data.text ?? "";
  } finally {
    alProgresar = null;
  }
}
