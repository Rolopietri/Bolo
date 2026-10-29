"use client";

import { useEffect, useRef, useState } from "react";
import { CameraIcon, BoltIcon } from "@/components/icons";
import { aplanarHoja, cargarOpenCV, detectarHoja, type Esquinas } from "@/lib/facturas/ocr";

// Cámara guiada para escanear facturas: busca los bordes de la hoja en vivo,
// avisa si está borrosa, oscura o con reflejo, y dispara sola cuando la hoja
// está quieta y nítida. Entrega la hoja ya aplanada (como escaneada). Todo en
// el teléfono; requiere HTTPS (Vercel ya lo da).

type Estado = { mensaje: string; listo: boolean };

/** Nitidez (varianza del Laplaciano), brillo y reflejo de una imagen chica. */
function calidad(cv: Awaited<ReturnType<typeof cargarOpenCV>>, chico: HTMLCanvasElement) {
  const src = cv.imread(chico);
  const gris = new cv.Mat();
  const lap = new cv.Mat();
  const media = new cv.Mat();
  const desvio = new cv.Mat();
  try {
    cv.cvtColor(src, gris, cv.COLOR_RGBA2GRAY);
    cv.Laplacian(gris, lap, cv.CV_64F);
    cv.meanStdDev(lap, media, desvio);
    const nitidez = desvio.data64F[0] ** 2;
    const brillo = cv.mean(gris)[0];
    let saturados = 0;
    for (let i = 0; i < gris.data.length; i += 4) if (gris.data[i] > 250) saturados++;
    return { nitidez, brillo, reflejo: saturados / (gris.data.length / 4) };
  } finally {
    src.delete();
    gris.delete();
    lap.delete();
    media.delete();
    desvio.delete();
  }
}

export function CamaraGuiada({
  onCapturar,
  onCerrar,
  onCamaraDelTelefono,
}: {
  /** Recibe la foto (la hoja aplanada si se encontró). */
  onCapturar: (foto: File) => void;
  onCerrar: () => void;
  /** Usar la cámara normal del teléfono en lugar de la guiada. */
  onCamaraDelTelefono: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const capaRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const esquinasRef = useRef<Esquinas | null>(null);
  const quietoRef = useRef(0);
  const capturandoRef = useRef(false);
  const [estado, setEstado] = useState<Estado>({ mensaje: "Abriendo la cámara…", listo: false });
  const [error, setError] = useState<string | null>(null);
  const [linterna, setLinterna] = useState<boolean | null>(null);

  async function capturar() {
    const video = videoRef.current;
    if (!video || capturandoRef.current || !video.videoWidth) return;
    capturandoRef.current = true;
    setEstado({ mensaje: "Capturando…", listo: true });
    const c = document.createElement("canvas");
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    c.getContext("2d")?.drawImage(video, 0, 0);
    let salida = c;
    try {
      const esquinas = esquinasRef.current;
      if (esquinas) salida = aplanarHoja(await cargarOpenCV(), c, esquinas);
    } catch {
      salida = c;
    }
    salida.toBlob(
      (b) => {
        if (b) onCapturar(new File([b], "factura.jpg", { type: "image/jpeg" }));
        onCerrar();
      },
      "image/jpeg",
      0.92,
    );
  }

  useEffect(() => {
    let cancelado = false;
    let temporizador: ReturnType<typeof setTimeout> | null = null;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 3840 }, height: { ideal: 2160 } },
          audio: false,
        });
        if (cancelado) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const pista = stream.getVideoTracks()[0];
        const capacidades = pista.getCapabilities?.() as { torch?: boolean } | undefined;
        if (capacidades?.torch) setLinterna(false);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch {
        setError("No pude abrir la cámara. Dale permiso en el navegador o usa la cámara del teléfono.");
        return;
      }
      setEstado({ mensaje: "Preparando el detector de hojas…", listo: false });
      let cv: Awaited<ReturnType<typeof cargarOpenCV>>;
      try {
        cv = await cargarOpenCV();
      } catch {
        setEstado({ mensaje: "Sin detector de hojas: captura con el botón.", listo: true });
        return;
      }
      const vuelta = () => {
        if (cancelado || capturandoRef.current) return;
        const video = videoRef.current;
        const capa = capaRef.current;
        if (video && capa && video.videoWidth) {
          const vw = video.videoWidth;
          const vh = video.videoHeight;
          const esquinas = detectarHoja(cv, video, vw, vh);
          // Dibujar la hoja encontrada sobre el video.
          capa.width = capa.clientWidth;
          capa.height = capa.clientHeight;
          const ctx = capa.getContext("2d");
          const escala = Math.max(capa.width / vw, capa.height / vh); // video en "cover"
          const dx = (capa.width - vw * escala) / 2;
          const dy = (capa.height - vh * escala) / 2;
          // Calidad con una versión chica del cuadro.
          const chico = document.createElement("canvas");
          chico.width = 480;
          chico.height = Math.round((480 * vh) / vw);
          chico.getContext("2d")?.drawImage(video, 0, 0, chico.width, chico.height);
          const q = calidad(cv, chico);
          // ¿Se movió la hoja desde la vuelta anterior?
          const previa = esquinasRef.current;
          const movimiento =
            esquinas && previa ? Math.max(...esquinas.map((p, i) => Math.hypot(p.x - previa[i].x, p.y - previa[i].y))) / Math.max(vw, vh) : 1;
          esquinasRef.current = esquinas;
          quietoRef.current = esquinas && movimiento < 0.015 ? quietoRef.current + 1 : 0;
          let mensaje = "Listo: sostén firme…";
          let ok = true;
          if (!esquinas) [mensaje, ok] = ["Acerca la factura: que se vean sus 4 bordes sobre un fondo oscuro", false];
          else if (q.brillo < 60) [mensaje, ok] = ["Poca luz: busca más luz o usa la linterna", false];
          else if (q.reflejo > 0.04) [mensaje, ok] = ["Mucho reflejo: inclina un poco el teléfono", false];
          else if (q.nitidez < 60) [mensaje, ok] = ["Está borrosa: sostén firme o aléjate un poco", false];
          else if (quietoRef.current < 4) [mensaje, ok] = ["Sostén firme…", true];
          setEstado({ mensaje, listo: ok });
          if (ctx) {
            ctx.clearRect(0, 0, capa.width, capa.height);
            if (esquinas) {
              ctx.strokeStyle = ok ? "#22c55e" : "#f59e0b";
              ctx.lineWidth = 4;
              ctx.beginPath();
              esquinas.forEach((p, i) => {
                const x = p.x * escala + dx;
                const y = p.y * escala + dy;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
              });
              ctx.closePath();
              ctx.stroke();
            }
          }
          // Dispara sola: hoja quieta ~1 s, nítida, con luz y sin reflejo.
          if (ok && quietoRef.current >= 4) {
            void capturar();
            return;
          }
        }
        temporizador = setTimeout(vuelta, 250);
      };
      vuelta();
    })();
    return () => {
      cancelado = true;
      if (temporizador) clearTimeout(temporizador);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // capturar usa refs; se monta una sola vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function alternarLinterna() {
    const pista = streamRef.current?.getVideoTracks()[0];
    if (!pista || linterna === null) return;
    try {
      await pista.applyConstraints({ advanced: [{ torch: !linterna } as MediaTrackConstraintSet] });
      setLinterna(!linterna);
    } catch {
      setLinterna(null);
    }
  }

  return (
    <div role="dialog" aria-label="Cámara para facturas" className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="relative flex-1 overflow-hidden">
        {error ? (
          <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-white/85">{error}</div>
        ) : (
          <>
            <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
            <canvas ref={capaRef} className="pointer-events-none absolute inset-0 h-full w-full" />
            <p
              className={`absolute inset-x-4 top-4 rounded-xl px-4 py-2 text-center text-sm font-medium ${
                estado.listo ? "bg-emerald-600/90 text-white" : "bg-black/70 text-white"
              }`}
              aria-live="polite"
            >
              {estado.mensaje}
            </p>
          </>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 bg-black p-4 text-white">
        <button type="button" onClick={onCerrar} className="rounded-lg px-3 py-2 text-sm text-white/80 hover:text-white">
          Cancelar
        </button>
        {!error && (
          <button
            type="button"
            onClick={() => void capturar()}
            aria-label="Capturar"
            className="grid size-16 place-items-center rounded-full bg-white text-cacao ring-4 ring-white/30"
          >
            <CameraIcon className="size-7" />
          </button>
        )}
        <div className="flex flex-col items-end gap-1">
          {linterna !== null && (
            <button type="button" onClick={() => void alternarLinterna()} className="inline-flex items-center gap-1 text-xs text-white/80">
              <BoltIcon className="size-4" />
              {linterna ? "Apagar luz" : "Linterna"}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              onCerrar();
              onCamaraDelTelefono();
            }}
            className="text-xs text-white/70 underline"
          >
            Cámara del teléfono
          </button>
        </div>
      </div>
    </div>
  );
}
