import Link from "next/link";
import { CheckIcon } from "@/components/icons";

// Línea horizontal de los 4 pasos del montaje de Cocina. Se usa en la portada
// (sin resaltar) y en la parte superior de cada página-paso: `actual` (1–4)
// pinta de naranja el paso donde está el cliente y marca los ya hechos.
const PASOS: { href: string; label: string; guia: string }[] = [
  { href: "/cocina/proveedores", label: "Proveedores", guia: "paso-proveedores" },
  { href: "/cocina/insumos", label: "Insumos", guia: "paso-insumos" },
  { href: "/cocina/recetas", label: "Recetas", guia: "paso-recetas" },
  { href: "/cocina/compras", label: "Compras", guia: "paso-compras" },
];

export function PasosCocina({
  actual = 0,
  className = "",
}: {
  /** Paso donde está el cliente (1–4). 0 = ninguno resaltado (portada). */
  actual?: number;
  className?: string;
}) {
  return (
    <section aria-label="Los 4 pasos" className={className}>
      <ol className="relative flex items-start justify-between gap-1">
        {/* Línea base que conecta los números */}
        <span
          aria-hidden
          className="absolute top-4 left-[12.5%] right-[12.5%] h-px bg-marfil"
        />
        {PASOS.map((p, i) => {
          const n = i + 1;
          const hecho = actual > 0 && n < actual;
          const activo = n === actual;
          return (
            <li key={p.href} className="relative z-10 min-w-0 flex-1">
              <Link
                href={p.href}
                data-guia={p.guia}
                aria-current={activo ? "step" : undefined}
                className="group flex flex-col items-center gap-1.5 text-center"
              >
                <span
                  className={`grid size-8 place-items-center rounded-full font-cinzel text-sm transition-colors ${
                    activo
                      ? "bg-terracotta text-white ring-4 ring-naranja-soft/50"
                      : hecho
                        ? "bg-naranja-soft/70 text-terracotta"
                        : "bg-marfil text-cacao-soft group-hover:bg-terracotta group-hover:text-white"
                  }`}
                >
                  {hecho ? <CheckIcon className="size-4" /> : n}
                </span>
                <span
                  className={`text-xs leading-tight transition-colors sm:text-sm ${
                    activo
                      ? "font-medium text-terracotta"
                      : "text-cacao group-hover:text-terracotta"
                  }`}
                >
                  {p.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
