import { Header } from "@/components/Header";
import { MenuLista, type MenuItem } from "@/components/MenuLista";
import { DocIcon, ClipboardIcon, BoxIcon, UsersIcon } from "@/components/icons";

const modulos: MenuItem[] = [
  {
    href: "/presupuestos/lista",
    label: "Presupuestos",
    desc: "Histórico de cotizaciones generadas + crear nuevo.",
    Icon: DocIcon,
  },
  {
    href: "/presupuestos/catalogo",
    label: "Catálogo de servicios",
    desc: "Espacios, personal y servicios propios con sus tarifas.",
    Icon: ClipboardIcon,
  },
  {
    href: "/presupuestos/inventario",
    label: "Inventario de alquiler",
    desc: "Mobiliario y objetos que ofrecemos para eventos.",
    Icon: BoxIcon,
  },
  {
    href: "/presupuestos/contratistas",
    label: "Contratistas",
    desc: "Servicios de terceros que ofrecemos al cliente.",
    Icon: UsersIcon,
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

        <MenuLista items={modulos} />
      </main>
    </>
  );
}
