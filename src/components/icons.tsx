import type { SVGProps } from "react";

/**
 * Iconos de línea (estilo feather, monocromáticos) para reemplazar emojis y
 * mantener la estética editorial. Heredan el color del texto (currentColor) y
 * el tamaño se controla por className (ej. "size-3.5" inline, "size-8" grande).
 */
function Svg({ className = "size-4", ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`inline-block shrink-0 ${className}`}
      {...props}
    />
  );
}

export function CalendarIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </Svg>
  );
}

export function ClockIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </Svg>
  );
}

export function PinIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="2.6" />
    </Svg>
  );
}

export function UsersIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M16 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20" />
      <circle cx="9" cy="7" r="3.5" />
      <path d="M22 20v-1.5a4 4 0 0 0-3-3.86M15.5 3.6a4 4 0 0 1 0 6.8" />
    </Svg>
  );
}

export function PaperclipIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M20.5 11.5 12 20a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8" />
    </Svg>
  );
}

export function DocIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
      <path d="M8.5 13h7M8.5 16.5h7" />
    </Svg>
  );
}

export function MailIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 6.5 8.5 6 8.5-6" />
    </Svg>
  );
}

export function SaveIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
      <path d="M17 21v-8H7v8M7 3v5h8" />
    </Svg>
  );
}

export function WarningIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h16.9a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </Svg>
  );
}

export function CartIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <circle cx="9" cy="20" r="1.4" />
      <circle cx="18" cy="20" r="1.4" />
      <path d="M2 3h2.2l2.4 12a1.6 1.6 0 0 0 1.6 1.3h9a1.6 1.6 0 0 0 1.6-1.3L20.5 7H6" />
    </Svg>
  );
}

/** Chevron para desplegar/colapsar. Apunta a la derecha; rótalo con CSS
 *  (ej. `rotate-90`) para el estado abierto. */
export function ChevronIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M9 6l6 6-6 6" />
    </Svg>
  );
}

/** Signo "+" para acciones de agregar. */
export function PlusIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

/** Lápiz para editar. */
export function PencilIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M4 20h4L18.5 9.5a2 2 0 0 0-2.8-2.8L5 17.2V20Z" />
      <path d="M13.5 6.5l4 4" />
    </Svg>
  );
}

export function WifiIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M2.5 8.5a15 15 0 0 1 19 0" />
      <path d="M5.5 12.2a10.5 10.5 0 0 1 13 0" />
      <path d="M8.5 15.9a6 6 0 0 1 7 0" />
      <path d="M12 19.5h.01" />
    </Svg>
  );
}

export function QrIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <path d="M14 14h3v3h-3zM20.5 14v3M14 20.5h7" />
    </Svg>
  );
}

export function PhoneIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M6.5 3h11a1.5 1.5 0 0 1 1.5 1.5v15A1.5 1.5 0 0 1 17.5 21h-11A1.5 1.5 0 0 1 5 19.5v-15A1.5 1.5 0 0 1 6.5 3Z" />
      <path d="M11 18h2" />
    </Svg>
  );
}

export function CakeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M4 21h16v-6a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3v6Z" />
      <path d="M4 16.5c1.5 1.2 2.8 1.2 4 0s2.5-1.2 4 0 2.8 1.2 4 0" />
      <path d="M12 8.5V6M8.5 8.5V7M15.5 8.5V7" />
    </Svg>
  );
}

export function DownloadIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M12 3v12" />
      <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
      <path d="M4 19.5h16" />
    </Svg>
  );
}

export function CopyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M6 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V6" />
    </Svg>
  );
}

export function CheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="m4.5 12.5 5 5 10-11" />
    </Svg>
  );
}

export function TrashIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M4 6.5h16M9.5 6.5V4.5A1.5 1.5 0 0 1 11 3h2a1.5 1.5 0 0 1 1.5 1.5v2" />
      <path d="M6.5 6.5 7.4 20a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-13.5" />
      <path d="M10.5 10.5v7M13.5 10.5v7" />
    </Svg>
  );
}

export function SearchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m16.2 16.2 4.3 4.3" />
    </Svg>
  );
}
