import Link from "next/link";
import { ChevronIcon } from "@/components/icons";

/**
 * Banner de "continuar / saltar" para la guía de primeros pasos de Cocina. Va
 * al final de una página-paso: el usuario puede seguir trabajando en el paso
 * actual (el formulario sigue arriba), saltar la guía, o avanzar al siguiente
 * paso sin devolverse al menú. Sin `siguiente`, muestra el cierre (último paso).
 */
export function PasoSiguiente({
  paso,
  total = 4,
  seguirTexto,
  siguiente,
  saltarHref = "/cocina",
}: {
  paso: number;
  total?: number;
  /** Qué puede seguir haciendo en este paso (p. ej. "seguir agregando proveedores"). */
  seguirTexto: string;
  /** El siguiente paso: a dónde ir y cómo se llama. Sin esto, es el paso final. */
  siguiente?: { href: string; label: string };
  /** A dónde va "Saltar" (por defecto, al inicio de Cocina). */
  saltarHref?: string;
}) {
  const final = !siguiente;
  return (
    <section className="mt-10 flex flex-col gap-4 rounded-2xl bg-cacao p-5 text-white sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div className="min-w-0">
        <p className="font-display text-[10px] uppercase tracking-[0.35em] text-white/50">
          Paso {paso} de {total}
        </p>
        <p className="mt-1 text-sm text-white/90">
          {final
            ? "¡Listo! Ya montaste tu cocina. Puedes seguir registrando compras aquí arriba."
            : `Puedes ${seguirTexto} aquí arriba, o continuar con el siguiente paso.`}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-4">
        {!final && (
          <Link
            href={saltarHref}
            className="text-xs uppercase tracking-widest text-white/60 transition-colors hover:text-white"
          >
            Saltar
          </Link>
        )}
        <Link
          href={final ? "/cocina" : siguiente.href}
          className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-xs font-medium uppercase tracking-widest text-cacao transition-colors hover:bg-marfil-soft"
        >
          {final ? "Terminar" : `Siguiente: ${siguiente.label}`}
          <ChevronIcon className="size-4" />
        </Link>
      </div>
    </section>
  );
}
