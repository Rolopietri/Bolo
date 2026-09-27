import { Header } from "@/components/Header";
import Link from "next/link";
import { BcvRateBanner } from "./BcvRateBanner";

const modulos: {
  href: string;
  label: string;
  desc: string;
  index: string;
  disabled?: boolean;
}[] = [
  {
    href: "/cocina/catalogo",
    label: "Insumos e Inventario",
    desc: "Insumos, proveedores, stock, pérdidas, auditoría y alertas.",
    index: "M1",
  },
  {
    href: "/cocina/recetas",
    label: "Recetario y Subrecetas",
    desc: "Fichas técnicas con expansión de subrecetas hasta materia prima.",
    index: "M2",
  },
  {
    href: "/cocina/costeo",
    label: "Costeo",
    desc: "Costo por receta + decisión del precio de venta (editable inline sin / con IVA).",
    index: "M3",
  },
  {
    href: "/cocina/rentabilidad",
    label: "Rentabilidad y Precio de Venta",
    desc: "Margen bruto, margen neto, food cost y semáforo por receta.",
    index: "M4",
  },
  {
    href: "/cocina/inventario",
    label: "Producción, Compras y Ventas",
    desc: "Planes de producción, compras, ventas Xetux y pedido sugerido.",
    index: "M5",
  },
  {
    href: "/cocina/menaje",
    label: "Menaje",
    desc: "Vajilla, cristalería, cubiertos y utensilios — bajas y compras con factura.",
    index: "M6",
  },
];

export default function CocinaHub() {
  return (
    <>
      <Header subtitle="Cocina" />
      <main className="flex-1 mx-auto w-full max-w-4xl px-5 py-10">
        <section className="mb-8">
          <p className="font-display text-[11px] tracking-[0.4em] text-cacao-soft">
            Operación gastronómica
          </p>
          <h1 className="mt-2 font-cinzel text-2xl sm:text-3xl tracking-[0.12em] uppercase text-cacao">
            Cocina
          </h1>
          <p className="mt-3 font-serif italic text-cacao-soft max-w-2xl">
            Catálogo de insumos, recetas, costos e inventario. Cinco módulos
            encadenados — cargamos el primero y vamos abriendo los siguientes.
          </p>
        </section>

        <BcvRateBanner />

        <section className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-px bg-marfil sm:border sm:border-marfil">
          {modulos.map((m) =>
            m.disabled ? (
              <div
                key={m.label}
                className="bg-white p-7 sm:p-8 opacity-50 cursor-not-allowed"
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-cinzel text-base text-cacao-mute">
                    {m.index}
                  </span>
                  <span className="font-display text-[10px] tracking-[0.35em] text-cacao-mute">
                    PRÓXIMAMENTE
                  </span>
                </div>
                <h2 className="mt-6 text-xl font-medium tracking-tight text-cacao">
                  {m.label}
                </h2>
                <p className="mt-2 font-serif italic text-sm text-cacao-mute">
                  {m.desc}
                </p>
              </div>
            ) : (
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
            ),
          )}
        </section>
      </main>
    </>
  );
}
