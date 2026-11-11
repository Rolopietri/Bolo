import { Header } from "@/components/Header";
import Link from "next/link";
import { funcionActiva } from "@/lib/modulos.mjs";
import { ChevronIcon } from "@/components/icons";
import { Hoy } from "./_Hoy";

// El saludo y la fecha son de hoy (hora de Caracas). No se prerenderiza.
export const dynamic = "force-dynamic";

type Acceso = {
  href: string;
  label: string;
  /** Función opcional: la pastilla solo aparece si está en BOLO_MODULOS. */
  funcion?: "planes";
  /** Ancla del cursor-guía del asistente. */
  dataGuia?: string;
};

type Grupo = {
  titulo: string;
  accesos: Acceso[];
};

// Accesos directos del Home. Cada pastilla abre su pantalla; las páginas
// intermedias (/cocina/catalogo, /cocina/inventario) siguen vivas para no
// romper enlaces, pero ya no se enlazan desde aquí.
const GRUPOS: Grupo[] = [
  {
    titulo: "Inventario",
    accesos: [
      { href: "/cocina/insumos", label: "Insumos" },
      { href: "/cocina/inventario/stock", label: "Stock" },
      { href: "/cocina/inventario/conteo", label: "Conteo" },
      { href: "/cocina/proveedores", label: "Proveedores" },
      { href: "/cocina/menaje", label: "Menaje" },
    ],
  },
  {
    titulo: "Recetas",
    accesos: [
      { href: "/cocina/recetas", label: "Recetas" },
      { href: "/cocina/costeo", label: "Costeo" },
      { href: "/cocina/plato", label: "Crear un plato", dataGuia: "guia-plato" },
    ],
  },
  {
    titulo: "Operación",
    accesos: [
      { href: "/cocina/compras", label: "Compras" },
      { href: "/cocina/ventas", label: "Ventas" },
      { href: "/cocina/pedido", label: "Pedido sugerido" },
      {
        href: "/cocina/inventario/planes",
        label: "Planes de producción",
        funcion: "planes",
      },
    ],
  },
];

function gruposVisibles(valor: string | undefined): Grupo[] {
  return GRUPOS.map((grupo) => ({
    ...grupo,
    accesos: grupo.accesos.filter(
      (acceso) => !acceso.funcion || funcionActiva(acceso.funcion, valor),
    ),
  })).filter((grupo) => grupo.accesos.length > 0);
}

export default function CocinaHub() {
  const grupos = gruposVisibles(process.env.BOLO_MODULOS);
  return (
    <>
      <Header subtitle="Hoy" />
      <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-8 sm:py-10">
        <Hoy />

        <section className="mt-10" aria-labelledby="modulos-titulo">
          <h2
            id="modulos-titulo"
            className="text-[11px] uppercase tracking-[0.3em] text-cacao-soft"
          >
            Módulos
          </h2>
          <div className="mt-3 flex flex-col gap-4">
            {grupos.map((grupo) => (
              <div
                key={grupo.titulo}
                className="rounded-3xl bg-marfil-soft px-5 py-5 sm:px-6 sm:py-6"
              >
                <h3 className="font-cinzel text-xl text-cacao">{grupo.titulo}</h3>
                <div className="mt-3 flex flex-wrap gap-2.5">
                  {grupo.accesos.map((acceso) => (
                    <Link
                      key={acceso.href}
                      href={acceso.href}
                      data-guia={acceso.dataGuia}
                      className="inline-flex items-center gap-1 rounded-full bg-white px-4 py-2 text-sm font-semibold text-cacao shadow-sm ring-1 ring-marfil transition-colors hover:text-terracotta hover:ring-terracotta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
                    >
                      {acceso.label}
                      <ChevronIcon className="size-3.5 text-terracotta" />
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
