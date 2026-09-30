import Image from "next/image";
import Link from "next/link";
import type { ComponentType, SVGProps } from "react";
import { Header } from "@/components/Header";
import { CalendarioClient } from "./calendario/CalendarioClient";
import {
  CheckIcon,
  CalendarIcon,
  DocIcon,
  CartIcon,
  ChartIcon,
  WifiIcon,
  ChevronIcon,
} from "@/components/icons";

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

const cards: {
  href: string;
  title: string;
  desc: string;
  Icon: IconType;
}[] = [
  { href: "/tareas", title: "Tareas", desc: "Lo que hay que hacer.", Icon: CheckIcon },
  { href: "/eventos", title: "Eventos", desc: "Próximos eventos.", Icon: CalendarIcon },
  { href: "/presupuestos", title: "Presupuestos", desc: "Cotizaciones y precios.", Icon: DocIcon },
  { href: "/cocina", title: "Cocina", desc: "Insumos, recetas y compras.", Icon: CartIcon },
  { href: "/administracion", title: "Administración", desc: "Cuentas y dinero.", Icon: ChartIcon },
  { href: "/admin/wifi", title: "WiFi", desc: "Clave del WiFi y clientes.", Icon: WifiIcon },
];

export default function Home() {
  return (
    <>
      <Header />
      <main className="flex-1 mx-auto w-full max-w-3xl px-4 sm:px-5 py-10 sm:py-14">
        {/* Hero */}
        <section className="text-center mb-10 sm:mb-12">
          <Image
            src="/bolo-logo.png"
            alt="bolo"
            width={560}
            height={224}
            className="mx-auto h-16 sm:h-20 w-auto"
            priority
          />
          <p className="mt-5 text-lg sm:text-xl text-cacao-soft">
            Tu panel de trabajo,{" "}
            <span className="text-navy font-bold">simple y fácil</span>.
          </p>
        </section>

        {/* Accesos */}
        <section className="mb-12 sm:mb-14">
          <h2 className="font-cinzel text-xl text-cacao mb-4">
            ¿Qué quieres hacer?
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {cards.map((c) => (
              <Link
                key={c.href}
                href={c.href}
                className="group flex items-center gap-4 rounded-2xl bg-white ring-1 ring-marfil p-4 hover:ring-navy/30 hover:shadow-sm transition"
              >
                <span className="grid place-items-center size-12 shrink-0 rounded-xl bg-naranja-soft/60 text-navy group-hover:bg-terracotta group-hover:text-white transition-colors">
                  <c.Icon className="size-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="font-cinzel text-lg text-cacao leading-tight">
                    {c.title}
                  </h3>
                  <p className="text-sm text-cacao-soft leading-snug">
                    {c.desc}
                  </p>
                </div>
                <ChevronIcon className="size-5 text-cacao-mute group-hover:text-terracotta group-hover:translate-x-0.5 transition" />
              </Link>
            ))}
          </div>
        </section>

        {/* Calendario */}
        <section className="mb-10">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="font-cinzel text-xl text-cacao">Calendario</h2>
            <Link
              href="/calendario"
              className="text-sm font-semibold text-terracotta hover:text-terracotta-deep transition-colors whitespace-nowrap"
            >
              Ver todo →
            </Link>
          </div>
          <CalendarioClient />
        </section>

        {/* Footer */}
        <footer className="mt-14 text-center">
          <Image
            src="/bolo-logo.png"
            alt="bolo"
            width={200}
            height={80}
            className="mx-auto h-6 w-auto opacity-70"
          />
          <p className="mt-3 text-sm text-cacao-mute">
            Tu panel de trabajo.
          </p>
        </footer>
      </main>
    </>
  );
}
