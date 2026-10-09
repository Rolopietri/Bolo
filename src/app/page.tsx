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
} from "@/components/icons";

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
  }));

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
          <h2 className="font-cinzel text-xl text-cacao mb-2">
            ¿Qué quieres hacer?
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
          <p className="mt-3 text-sm text-cacao-mute">
            Tu panel de trabajo.
          </p>
        </footer>
      </main>
    </>
  );
}
