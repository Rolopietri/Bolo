import { Header } from "@/components/Header";
import Link from "next/link";

const modulos: {
  href: string;
  label: string;
  desc: string;
  index: string;
}[] = [
  {
    href: "/presupuestos/lista",
    label: "Presupuestos",
    desc: "Histórico de cotizaciones generadas + crear nuevo.",
    index: "01",
  },
  {
    href: "/presupuestos/catalogo",
    label: "Catálogo de servicios",
    desc: "Espacios, personal y servicios propios con sus tarifas.",
    index: "02",
  },
  {
    href: "/presupuestos/inventario",
    label: "Inventario de alquiler",
    desc: "Mobiliario y objetos que ofrecemos para eventos.",
    index: "03",
  },
  {
    href: "/presupuestos/contratistas",
    label: "Contratistas",
    desc: "Servicios de terceros que ofrecemos al cliente.",
    index: "04",
  },
];

export default function PresupuestosHub() {
  return (
    <>
      <Header subtitle="Presupuestos" />
      <main className="flex-1 mx-auto w-full max-w-4xl px-5 py-10">
        <section className="mb-8">
          <p className="font-display text-[11px] tracking-[0.4em] text-cacao-soft">
            Eventos & cotizaciones
          </p>
          <h1 className="mt-2 font-cinzel text-2xl sm:text-3xl tracking-[0.12em] uppercase text-cacao">
            Presupuestos
          </h1>
          <p className="mt-3 font-serif italic text-cacao-soft max-w-2xl">
            Todo lo que arma un presupuesto de evento: tus servicios, tu
            inventario de alquiler, y la red de contratistas que coordinas.
          </p>
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-marfil sm:border sm:border-marfil">
          {modulos.map((m) => (
            <Link
              key={m.href}
              href={m.href}
              className="group bg-white p-7 sm:p-8 transition-colors duration-300 hover:bg-marfil-soft"
            >
              <div className="flex items-baseline justify-between">
                <span className="font-cinzel text-base text-cacao-mute">
                  {m.index}
                </span>
                <span className="font-display text-[10px] tracking-[0.35em] text-cacao-soft">
                  DISPONIBLE
                </span>
              </div>
              <h2 className="mt-6 text-xl font-medium tracking-tight text-cacao">
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
      </main>
    </>
  );
}
