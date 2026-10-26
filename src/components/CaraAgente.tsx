import type { SVGProps } from "react";

/**
 * Cara del asistente. El wordmark "bolo" ya es una cara:
 * la b es la oreja, la primera o el ojo izquierdo, la l la nariz
 * y la última o el ojo derecho. La sonrisa va debajo de ojos y nariz,
 * no debajo de la oreja.
 */
export function CaraAgente({
  className = "h-8 w-auto",
  title,
  ...props
}: SVGProps<SVGSVGElement> & { title?: string }) {
  return (
    <svg
      viewBox="0 0 88 62"
      className={`inline-block shrink-0 ${className}`}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      {...props}
    >
      <text
        x="4"
        y="32"
        fill="currentColor"
        textLength="78"
        lengthAdjust="spacingAndGlyphs"
        fontFamily='"Baloo 2", Nunito, system-ui, sans-serif'
        fontWeight={800}
        fontSize="32"
      >
        bolo
      </text>
      {/* Sonrisa bajo o–l–o. Con el texto forzado a 78px, la oreja (b) ocupa
          el primer tramo y los ojos quedan hacia la derecha. */}
      <path
        d="M26 46c12 10 40 10 54 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
