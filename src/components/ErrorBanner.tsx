import type { ReactNode } from "react";

/** Banner de error estándar (fondo salmón, texto vino). Centraliza el markup
 *  que estaba copiado en ~17 pantallas. `className` ajusta margen/posición por
 *  sitio (ej. "mb-4", sticky…). El padding base es p-3. */
export function ErrorBanner({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg bg-[#F9EBE7] ring-1 ring-[#E8C5BC] p-3 text-sm text-[#7A2419] ${className}`.trim()}
    >
      {children}
    </div>
  );
}
