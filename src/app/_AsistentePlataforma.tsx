"use client";

import { usePathname } from "next/navigation";
import { AsistenteBolo } from "./cocina/_AsistenteBolo";
import { GuiaCursor } from "./cocina/_GuiaCursor";

// Monta el asistente (burbujita + cursor-guía) en TODA la plataforma, salvo en
// las pantallas de entrada/recuperación donde no aporta.
const OCULTAR_EN = ["/login", "/restablecer", "/auth"];

export function AsistentePlataforma() {
  const pathname = usePathname() || "/";
  if (OCULTAR_EN.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return null;
  }
  return (
    <>
      <AsistenteBolo />
      <GuiaCursor />
    </>
  );
}
