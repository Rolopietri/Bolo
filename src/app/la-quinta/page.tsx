import Image from "next/image";
import { Header } from "@/components/Header";

const directores: { nombre: string; roles: string[] }[] = [
  { nombre: "Ana María Pietri", roles: ["Directora"] },
  { nombre: "Rodrigo Lopez Pietri", roles: ["Director", "Fundador", "CEO"] },
];

const equipo: { nombre: string; roles: string[] }[] = [
  { nombre: "Beatriz Márquez", roles: ["Gerente General"] },
  { nombre: "Lucía Dickson", roles: ["Gerente de Gastronomía"] },
  { nombre: "Inés", roles: ["Head Chef", "Junta Directiva"] },
  { nombre: "Luis Castellanos", roles: ["Encargado de Mantenimiento"] },
  { nombre: "Wladimir Beleño", roles: ["Mantenimiento"] },
  { nombre: "Ana Velásquez", roles: ["Anfitriona"] },
  { nombre: "Aurora Hernández", roles: ["Anfitriona"] },
];

const inquilinos: [string, string][] = [
  ["Casa Payasa", "Planta A"],
  ["Arko", "Planta B"],
  ["Pilates", "Planta B"],
  ["Pilates (estudio 2)", "Planta B"],
  ["Holistic", "Planta B"],
  ["Mercadillo del Buen Gusto", "Planta C"],
  ["Archivo Público", "Planta C"],
];

const plantas: {
  label: string;
  imagen: string;
  items: string[];
}[] = [
  {
    label: "Planta A",
    imagen: "/planos/planta-a.png",
    items: [
      "Sala expositiva (eventos)",
      "Comedor",
      "Cocina",
      "Cafetín",
      "Casa Payasa",
    ],
  },
  {
    label: "Planta B",
    imagen: "/planos/planta-b.png",
    items: ["Sala multiusos", "Arko", "Pilates (×2)", "Holistic", "Vestuarios"],
  },
  {
    label: "Planta C",
    imagen: "/planos/planta-c.png",
    items: [
      "Mercadillo del Buen Gusto",
      "Oficinas",
      "Archivo Público",
      "Co-working",
    ],
  },
  {
    label: "Planta D",
    imagen: "/planos/planta-d.png",
    items: ["Espacio para eventos especiales"],
  },
];

const servicios: [string, string][] = [
  ["Seguridad", "Evenseg"],
  ["Aseo urbano", "Fospuca"],
  ["WiFi", "Starlink"],
  ["Community", "Nuca"],
  ["Mantenimiento de jardín", "Winderson y equipo"],
];

function PersonaSilueta() {
  return (
    <svg
      viewBox="0 0 64 64"
      className="size-16 text-cacao-mute"
      aria-hidden
    >
      <circle cx="32" cy="32" r="32" fill="#EDE8E2" />
      <circle cx="32" cy="25" r="9" fill="currentColor" />
      <path
        d="M32 38c-9.5 0-17 6.5-17 15v11h34V53c0-8.5-7.5-15-17-15z"
        fill="currentColor"
      />
    </svg>
  );
}

function PersonaCard({
  nombre,
  roles,
}: {
  nombre: string;
  roles: string[];
}) {
  return (
    <div className="flex items-center gap-4 py-3">
      <PersonaSilueta />
      <div className="min-w-0">
        <div className="font-medium text-cacao truncate">{nombre}</div>
        <div className="text-sm text-cacao-soft">{roles.join(" · ")}</div>
      </div>
    </div>
  );
}

export default function LaQuintaPage() {
  return (
    <>
      <Header subtitle="La Quinta" />
      <main className="flex-1 mx-auto w-full max-w-3xl px-5 py-10 space-y-8">
        <section className="text-center">
          <Image
            src="/logo-black.svg"
            alt="La Quinta Mamá"
            width={80}
            height={80}
            className="mx-auto h-20 w-20"
          />
          <h1 className="mt-5 font-display text-2xl sm:text-3xl tracking-[0.2em] uppercase text-cacao">
            La Quinta Mamá
          </h1>
          <p className="mt-3 text-cacao-soft italic max-w-xl mx-auto">
            Donde la cultura y el bienestar florecen. Casa patrimonial de los
            años 50, en Caracas.
          </p>
        </section>

        <Card title="La Casa">
          <div className="space-y-8">
            {plantas.map((p) => (
              <div key={p.label} className="space-y-3">
                <div className="font-display text-sm tracking-[0.25em] uppercase text-cacao">
                  {p.label}
                </div>
                <div className="relative aspect-[1600/1131] w-full overflow-hidden rounded-xl ring-1 ring-marfil bg-marfil-soft">
                  <Image
                    src={p.imagen}
                    alt={`Plano ${p.label}`}
                    fill
                    sizes="(max-width: 768px) 100vw, 720px"
                    className="object-contain"
                  />
                </div>
                <div className="text-sm text-cacao-soft">
                  {p.items.join(" · ")}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Equipo">
          <div className="mb-5">
            <h3 className="font-display text-xs tracking-[0.3em] uppercase text-cacao-mute mb-1">
              Directores
            </h3>
            <ul className="divide-y divide-marfil">
              {directores.map((p) => (
                <li key={p.nombre}>
                  <PersonaCard nombre={p.nombre} roles={p.roles} />
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-display text-xs tracking-[0.3em] uppercase text-cacao-mute mb-1">
              Equipo
            </h3>
            <ul className="divide-y divide-marfil">
              {equipo.map((p) => (
                <li key={p.nombre}>
                  <PersonaCard nombre={p.nombre} roles={p.roles} />
                </li>
              ))}
            </ul>
          </div>
        </Card>

        <Card title="Inquilinos">
          <ul className="divide-y divide-marfil">
            {inquilinos.map(([nombre, ubicacion]) => (
              <li
                key={nombre}
                className="py-2 flex justify-between gap-3"
              >
                <span className="font-medium text-cacao">{nombre}</span>
                <span className="text-cacao-soft text-sm">{ubicacion}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Servicios contratados">
          <ul className="divide-y divide-marfil">
            {servicios.map(([servicio, proveedor]) => (
              <li
                key={servicio}
                className="py-2 flex justify-between gap-3"
              >
                <span className="font-medium text-cacao">{servicio}</span>
                <span className="text-cacao-soft text-sm">{proveedor}</span>
              </li>
            ))}
          </ul>
        </Card>
      </main>
    </>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-white ring-1 ring-marfil p-5 sm:p-6">
      <h2 className="font-display text-base tracking-[0.2em] uppercase text-cacao mb-4">
        {title}
      </h2>
      {children}
    </div>
  );
}
