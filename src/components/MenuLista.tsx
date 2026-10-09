import Link from "next/link";
import type { ComponentType, SVGProps } from "react";
import { ChevronIcon } from "@/components/icons";

export type MenuItem = {
  href: string;
  label: string;
  desc: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Fuera de servicio por ahora: se muestra atenuado y sin enlace. */
  disabled?: boolean;
};

/**
 * Menú de navegación de la línea "one page": lista limpia a todo el ancho,
 * sin recuadros. Cada fila lleva icono en un círculo suave, título,
 * descripción corta y flecha; las filas se separan con una línea fina.
 */
export function MenuLista({
  items,
  className = "",
}: {
  items: MenuItem[];
  className?: string;
}) {
  return (
    <ul className={`divide-y divide-marfil border-y border-marfil ${className}`}>
      {items.map(({ href, label, desc, Icon, disabled }) => {
        const contenido = (
          <>
            <span
              className={`grid size-11 shrink-0 place-items-center rounded-full transition-colors ${
                disabled
                  ? "bg-marfil-light text-cacao-mute"
                  : "bg-naranja-soft/60 text-terracotta group-hover:bg-terracotta group-hover:text-white"
              }`}
            >
              <Icon className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span
                className={`block font-cinzel text-lg leading-tight transition-colors ${
                  disabled ? "text-cacao-mute" : "text-cacao group-hover:text-terracotta"
                }`}
              >
                {label}
              </span>
              <span className="mt-0.5 block text-sm leading-snug text-cacao-soft">
                {desc}
              </span>
            </span>
            {disabled ? (
              <span className="text-[10px] uppercase tracking-[0.3em] text-cacao-mute">
                Próximamente
              </span>
            ) : (
              <ChevronIcon className="size-5 text-cacao-mute transition group-hover:translate-x-1 group-hover:text-terracotta" />
            )}
          </>
        );
        return (
          <li key={href}>
            {disabled ? (
              <div className="flex items-center gap-4 py-4 opacity-60">
                {contenido}
              </div>
            ) : (
              <Link href={href} className="group flex items-center gap-4 py-4">
                {contenido}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
