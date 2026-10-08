import { Header } from "@/components/Header";
import Link from "next/link";
import { funcionActiva } from "@/lib/modulos.mjs";
import { BcvRateBanner } from "./BcvRateBanner";

const modulos: {
  href: string;
  label: string;
  desc: string;
  /** Identificador interno (no se muestra). */
  clave: string;
  disabled?: boolean;
}[] = [
  {
    href: "/cocina/catalogo",
    label: "Insumos e Inventario",
    desc: "Insumos, proveedores, stock, pérdidas, auditoría y alertas.",
    clave: "insumos",
  },
  {
    href: "/cocina/recetas",
    label: "Recetario, Costeo y Precios",
    desc: "Recetas y subrecetas con su costo, precio de venta y semáforo de ganancia — todo junto.",
    clave: "recetas",
  },
  {
    href: "/cocina/inventario",
    label: "Compras, Ventas y Pedidos",
    desc: "Registra compras y ventas y consulta el pedido sugerido.",
    clave: "operaciones",
  },
  {
    href: "/cocina/menaje",
    label: "Menaje",
    desc: "Vajilla, cristalería, cubiertos y utensilios — bajas y compras con factura.",
    clave: "menaje",
  },
];

// Con Planes de producción activos (BOLO_MODULOS incluye "planes"), la tarjeta
// de Compras, Ventas y Pedidos vuelve a presentarse como centro de producción.
const OPERACIONES_CON_PLANES = {
  label: "Producción, Compras y Ventas",
  desc: "Planes de producción, compras, ventas y pedido sugerido.",
};

export default function CocinaHub() {
  const modulosVisibles = funcionActiva("planes", process.env.BOLO_MODULOS)
    ? modulos.map((m) => (m.clave === "operaciones" ? { ...m, ...OPERACIONES_CON_PLANES } : m))
    : modulos;
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
            Catálogo de insumos, recetas, costos e inventario. Sigue los pasos
            de “Para empezar”: cada sección usa los datos de la anterior.
          </p>
        </section>

        <BcvRateBanner />

        <section className="mt-6 rounded-2xl bg-white ring-1 ring-marfil p-5">
          <p className="font-display text-[11px] tracking-[0.3em] uppercase text-cacao-soft">
            Para empezar
          </p>
          <ol className="mt-3 grid grid-cols-1 sm:grid-cols-4 gap-2 text-sm">
            {[
              { href: "/cocina/proveedores", label: "Proveedores", desc: "A quién le compras" },
              { href: "/cocina/insumos", label: "Insumos", desc: "Qué compras y en qué unidad" },
              { href: "/cocina/recetas", label: "Recetas", desc: "Qué preparas con ellos" },
              { href: "/cocina/compras", label: "Compras", desc: "Precios y stock reales" },
            ].map((paso, i) => (
              <li key={paso.href}>
                <Link
                  href={paso.href}
                  className="flex h-full items-start gap-2 rounded-xl ring-1 ring-marfil px-3 py-2 hover:ring-terracotta/40 hover:bg-marfil-soft transition-colors"
                >
                  <span className="font-semibold text-terracotta">{i + 1}.</span>
                  <span>
                    <span className="block font-semibold text-cacao">{paso.label}</span>
                    <span className="block text-xs text-cacao-soft">{paso.desc}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>

        <Link
          href="/cocina/plato"
          className="group mt-8 flex items-center gap-4 rounded-2xl bg-white ring-1 ring-terracotta/40 p-6 shadow-sm transition-colors hover:bg-marfil-soft"
        >
          <span className="grid h-12 w-12 flex-none place-items-center rounded-full bg-terracotta text-white text-2xl">
            ★
          </span>
          <span className="min-w-0">
            <span className="font-display text-[10px] tracking-[0.35em] text-terracotta-deep">
              RÁPIDO
            </span>
            <span className="mt-1 block text-xl font-medium tracking-tight text-cacao">
              Crear un plato y ver su costo
            </span>
            <span className="mt-1 block font-serif italic text-sm text-cacao-soft">
              La forma fácil: escribe qué lleva el plato y bolo te dice cuánto
              cuesta y a qué precio venderlo. Se guarda en tu recetario.
            </span>
          </span>
          <span className="ml-auto hidden sm:block text-lg text-cacao group-hover:translate-x-1 group-hover:text-terracotta transition-all">
            →
          </span>
        </Link>

        <section className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-px bg-marfil sm:border sm:border-marfil">
          {modulosVisibles.map((m) =>
            m.disabled ? (
              <div
                key={m.label}
                className="bg-white p-7 sm:p-8 opacity-50 cursor-not-allowed"
              >
                <div className="flex items-baseline justify-end">
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
                <div className="flex items-baseline justify-end">
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
