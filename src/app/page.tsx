import Image from "next/image";
import { MenuLista } from "@/components/MenuLista";
import type { ComponentType, SVGProps } from "react";
import { Header } from "@/components/Header";
import { MODULOS, modulosActivos } from "@/lib/modulos.mjs";
import {
  CheckIcon,
  CalendarIcon,
  DocIcon,
  CartIcon,
  ChartIcon,
  WifiIcon,
  StoreIcon,
  SparkleIcon,
} from "@/components/icons";
import { BotonAsistente } from "./_BotonAsistente";

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

const ICONOS: Record<(typeof MODULOS)[number]["id"], IconType> = {
  cocina: CartIcon,
  administracion: ChartIcon,
  marketplace: StoreIcon,
  tareas: CheckIcon,
  eventos: CalendarIcon,
  presupuestos: DocIcon,
  wifi: WifiIcon,
};

export default function Home() {
  // Tareas, Eventos, Presupuestos y WiFi salen del menú, pero sus rutas siguen
  // vivas. Ver src/lib/modulos.mjs.
  const activos = new Set(modulosActivos(process.env.BOLO_MODULOS));
  const items = MODULOS.filter((m) => activos.has(m.id)).map((m) => ({
    href: m.href,
    label: m.title,
    desc: m.desc,
    Icon: ICONOS[m.id],
    dataGuia: `mod-${m.id}`,
  }));

  return (
    <>
      <Header />
      <main className="flex-1 mx-auto w-full max-w-2xl px-4 sm:px-5 py-10 sm:py-14">
        {/* Hero */}
        <section className="text-center mb-8 sm:mb-10">
          <Image
            src="/bolo-logo.png"
            alt="bolo"
            width={560}
            height={224}
            className="mx-auto h-16 sm:h-20 w-auto"
            priority
          />
          <p className="mt-4 text-lg sm:text-xl text-cacao-soft">
            Tu negocio, <span className="text-navy font-bold">simple y fácil</span>.
          </p>
        </section>

        {/* Puerta de entrada: el asistente. Lo primero y más grande. */}
        <section className="mb-10 rounded-3xl bg-cacao px-6 py-7 text-center text-white sm:px-8 sm:py-9">
          <span className="mx-auto grid size-12 place-items-center rounded-full bg-white/10">
            <SparkleIcon className="size-6 text-marfil" />
          </span>
          <h2 className="mt-4 font-cinzel text-xl sm:text-2xl leading-tight">
            ¿Qué necesitas hacer hoy?
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm sm:text-base text-marfil/85">
            Dímelo con tus palabras y te llevo directo. Si no sabes por dónde
            empezar, pregúntame — estoy para ayudarte.
          </p>
          <div className="mt-5">
            <BotonAsistente />
          </div>
        </section>

        {/* Accesos directos */}
        <section className="mb-12 sm:mb-14">
          <h2 className="text-[11px] uppercase tracking-[0.3em] text-cacao-soft mb-2">
            O entra directo
          </h2>
          <MenuLista items={items} />
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
          <p className="mt-3 text-sm text-cacao-mute">Tu panel de trabajo.</p>
        </footer>
      </main>
    </>
  );
}
