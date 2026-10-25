"use client";

import { useEffect, useRef, useState } from "react";
import { CameraIcon } from "@/components/icons";

// Ventanita de cámara en vivo: abre la webcam (o la cámara trasera en el
// teléfono) con getUserMedia, muestra el video y captura un cuadro como foto.
// Funciona en computadora y en móvil (requiere HTTPS, que Vercel ya da).
export function CamaraCaptura({
  onCapturar,
  onCerrar,
}: {
  /** Entrega la foto capturada ya en base64 (JPEG, sin el prefijo data:). */
  onCapturar: (data: string, tipo: string) => void;
  onCerrar: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    let cancelado = false;
    async function iniciar() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelado) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setListo(true);
      } catch {
        setError(
          "No pude abrir la cámara. Dale permiso en el navegador, o usa el botón de Galería.",
        );
      }
    }
    void iniciar();
    return () => {
      cancelado = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function capturar() {
    const video = videoRef.current;
    if (!video) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return;
    const maxLado = 1280;
    const escala = Math.min(1, maxLado / Math.max(vw, vh));
    const w = Math.round(vw * escala);
    const h = Math.round(vh * escala);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
    onCapturar(dataUrl.split(",")[1] ?? "", "image/jpeg");
    onCerrar();
  }

  return (
    <div
      role="dialog"
      aria-label="Cámara"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-cacao text-white shadow-2xl">
        <div className="relative aspect-[3/4] bg-black">
          {error ? (
            <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-white/85">
              {error}
            </div>
          ) : (
            <video
              ref={videoRef}
              playsInline
              muted
              className="h-full w-full object-cover"
            />
          )}
        </div>
        <div className="flex items-center justify-between gap-3 p-4">
          <button
            type="button"
            onClick={onCerrar}
            className="rounded-lg px-4 py-2 text-sm text-white/80 transition-colors hover:text-white"
          >
            Cancelar
          </button>
          {!error && (
            <button
              type="button"
              onClick={capturar}
              disabled={!listo}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-medium text-cacao transition-colors hover:bg-marfil-soft disabled:opacity-50"
            >
              <CameraIcon className="size-4" />
              Capturar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
