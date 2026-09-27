import Image from "next/image";
import Link from "next/link";
import { Header } from "@/components/Header";
import { CalendarioClient } from "./calendario/CalendarioClient";

const cards: {
  href: string;
  index: string;
  eyebrow: string;
  title: string;
  desc: string;
}[] = [
  {
    href: "/tareas",
    index: "01",
    eyebrow: "Operaciones",
    title: "Mis Tareas",
    desc: "Lo que tengo que hacer.",
  },
  {
    href: "/eventos",
    index: "02",
    eyebrow: "Agenda",
    title: "Eventos",
    desc: "Próximos eventos.",
  },
  {
    href: "/como-trabajamos",
    index: "03",
    eyebrow: "Manual",
    title: "Cómo Trabajamos",
    desc: "Protocolos y a quién acudir.",
  },
  {
    href: "/la-quinta",
    index: "04",
    eyebrow: "El Espacio",
    title: "La Quinta",
    desc: "La casa, equipo, inquilinos.",
  },
  {
    href: "/presupuestos",
    index: "05",
    eyebrow: "Documentos",
    title: "Presupuestos",
    desc: "Cotizaciones, catálogo, inventario y contratistas.",
  },
  {
    href: "/cocina",
    index: "06",
    eyebrow: "Operación",
    title: "Cocina",
    desc: "Insumos, recetas, costos e inventario.",
  },
  {
    href: "/administracion",
    index: "07",
    eyebrow: "Finanzas · Privado",
    title: "Administración",
    desc: "Estados financieros: gastos, ingresos y resultado. Requiere contraseña.",
  },
  {
    href: "/admin/wifi",
    index: "08",
    eyebrow: "Clientes",
    title: "WiFi de Invitados",
    desc: "QR de las mesas, clave del WiFi y base de clientes registrados.",
  },
];

export default function Home() {
  return (
    <>
      <Header />
      <main className="flex-1 mx-auto w-full max-w-3xl px-5 py-14 sm:py-20">
        {/* Hero */}
        <section className="text-center mb-16 sm:mb-20">
          <Image
            src="/logo-black.svg"
            alt="La Quinta Mamá"
            width={260}
            height={260}
            className="mx-auto h-44 w-44 sm:h-56 sm:w-56"
            priority
          />

          <p className="mt-8 font-display text-[11px] sm:text-xs tracking-[0.4em] text-cacao-soft">
            Casa de salud y cultura · Caracas
          </p>

          <h1 className="mt-4 font-cinzel text-4xl sm:text-5xl tracking-[0.12em] uppercase text-cacao">
            La Quinta Mamá
          </h1>

          <p className="mt-5 font-serif italic text-lg sm:text-xl text-cacao-soft max-w-md mx-auto leading-snug">
            Donde la cultura y el bienestar florecen.
          </p>

          <hr className="mt-12 mx-auto w-16 border-0 border-t border-marfil" />
        </section>

        {/* Calendario */}
        <section className="mb-16 sm:mb-20">
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <span className="font-display text-[10px] tracking-[0.35em] text-cacao-soft">
                AGENDA
              </span>
              <h2 className="mt-1 text-2xl font-medium tracking-tight text-cacao">
                Calendario
              </h2>
            </div>
            <Link
              href="/calendario"
              className="text-sm text-cacao-soft hover:text-terracotta transition-colors whitespace-nowrap"
            >
              Pantalla completa →
            </Link>
          </div>
          <CalendarioClient />
        </section>

        {/* Cards */}
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-marfil sm:border sm:border-marfil">
          {cards.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="group bg-white p-7 sm:p-9 transition-colors duration-300 hover:bg-marfil-soft"
            >
              <div className="flex items-baseline justify-between">
                <span className="font-cinzel text-base text-cacao-mute">
                  {c.index}
                </span>
                <span className="font-display text-[10px] tracking-[0.35em] text-cacao-soft">
                  {c.eyebrow.toUpperCase()}
                </span>
              </div>

              <h2 className="mt-8 text-2xl sm:text-[1.5rem] font-medium tracking-tight text-cacao">
                {c.title}
              </h2>

              <p className="mt-3 font-serif italic text-base text-cacao-soft leading-relaxed">
                {c.desc}
              </p>

              <div className="mt-8 flex justify-end items-center text-cacao group-hover:text-terracotta transition-colors">
                <span className="text-lg group-hover:translate-x-1 transition-transform duration-300">
                  →
                </span>
              </div>
            </Link>
          ))}
        </section>

        {/* Footer */}
        <footer className="mt-20 sm:mt-24 text-center">
          <hr className="mx-auto w-16 border-0 border-t border-marfil mb-6" />
          <p className="font-display text-[11px] tracking-[0.4em] text-cacao-soft">
            La Quinta Mamá · Caracas
          </p>
          <p className="mt-3 font-serif italic text-sm text-cacao-mute">
            Donde la cultura y el bienestar florecen.
          </p>
        </footer>
      </main>
    </>
  );
}
