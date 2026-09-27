import Link from "next/link";

export type SubModulo = {
  href: string;
  label: string;
  desc: string;
};

/**
 * Grid de sub-cards reusable para los hubs M1 y M5 (y futuros). Hereda el
 * mismo estilo editorial que el hub principal /cocina pero con un acento
 * visual de "estás dentro de un módulo".
 */
export function SubHubGrid({ modulos }: { modulos: SubModulo[] }) {
  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-marfil sm:border sm:border-marfil">
      {modulos.map((m) => (
        <Link
          key={m.href}
          href={m.href}
          className="group bg-white p-7 sm:p-8 transition-colors duration-300 hover:bg-marfil-soft"
        >
          <h2 className="text-xl font-medium tracking-tight text-cacao">
            {m.label}
          </h2>
          <p className="mt-2 font-serif italic text-sm text-cacao-soft">
            {m.desc}
          </p>
          <div className="mt-6 flex justify-end items-center text-cacao group-hover:text-terracotta transition-colors">
            <span className="text-lg group-hover:translate-x-1 transition-transform duration-300">
              →
            </span>
          </div>
        </Link>
      ))}
    </section>
  );
}
