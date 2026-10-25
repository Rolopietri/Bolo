"use client";

import { SparkleIcon } from "@/components/icons";
import { EVENTO_ABRIR } from "./cocina/_destinos";

// Botón de la portada que abre la burbujita del asistente.
export function BotonAsistente() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(EVENTO_ABRIR))}
      className="inline-flex items-center gap-2 rounded-xl bg-cacao px-5 py-3 font-medium text-white transition-colors hover:bg-terracotta"
    >
      <SparkleIcon className="size-5" />
      Preguntarle al asistente
    </button>
  );
}
