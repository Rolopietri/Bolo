import { Header } from "@/components/Header";
import Link from "next/link";
import { BalanzaIcon } from "@/components/icons";

// Producción: registro del cocinero de cuánto toma de cada insumo, cuánto le
// queda útil y cuánto desecha. De ahí sale la merma real (contra la de la
// ficha) y el control contra lo que descuentan las ventas.
// Por ahora presenta la función; el registro llega en la próxima entrega.

const PASOS = [
  {
    titulo: "Registra cada lote",
    texto: "Cuánto tomaste del insumo y cuánto te quedó útil. El desecho se calcula solo.",
  },
  {
    titulo: "Compara la merma",
    texto: "La merma real de cada lote contra la que tiene la ficha del insumo.",
  },
  {
    titulo: "Cuadra con las ventas",
    texto: "Lo que se procesó contra lo que las ventas dicen que se usó.",
  },
];

export default function ProduccionPage() {
  return (
    <>
      <Header subtitle="Producción" />
      <main className="flex-1 mx-auto w-full max-w-3xl px-5 py-10">
        <section className="mb-8 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="font-display text-[11px] tracking-[0.4em] text-cacao-soft">Cocina · Recetas</p>
            <h1 className="mt-2 font-cinzel text-2xl sm:text-3xl tracking-[0.12em] uppercase text-cacao">
              Producción
            </h1>
            <p className="mt-3 font-serif italic text-cacao-soft">
              Lo que recibes, procesas y desechas de cada insumo.
            </p>
          </div>
          <Link href="/cocina" className="text-xs uppercase tracking-widest text-cacao-soft hover:text-cacao">
            ← Cocina
          </Link>
        </section>

        <ol className="divide-y divide-marfil border-y border-marfil">
          {PASOS.map((p, i) => (
            <li key={p.titulo} className="flex items-start gap-4 py-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-naranja-soft/60 font-semibold text-terracotta">
                {i + 1}
              </span>
              <span>
                <span className="block font-cinzel text-lg text-cacao">{p.titulo}</span>
                <span className="block text-sm text-cacao-soft">{p.texto}</span>
              </span>
            </li>
          ))}
        </ol>

        <p className="mt-6 flex items-center gap-2 text-sm text-cacao-soft">
          <BalanzaIcon className="size-5 text-terracotta" />
          En preparación: muy pronto podrás registrar tu primer lote aquí.
        </p>
      </main>
    </>
  );
}
