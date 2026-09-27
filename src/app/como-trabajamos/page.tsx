import { Header } from "@/components/Header";

const aQuienAcudir: [string, string][] = [
  ["Cliente interesado en hacer evento", "Número corporativo → Gerente General"],
  ["Cliente interesado en reservas de canchas de pádel", "Número corporativo"],
  ["Incidente con inquilino", "Gerente General → Directiva"],
  ["Incidente de seguridad", "Evenseg → Directiva"],
  ["Daño / emergencia en la casa", "Equipo de mantenimiento"],
  ["Tema legal o contractual", "Abogado"],
  ["Gasto no planificado", "Contadores → Directiva"],
  ["Cocina", "Gerente de Gastronomía → Chef"],
  ["Cafetín", "Anfitrionas → Gerente de Gastronomía"],
  ["Redes sociales", "Nuca → Directiva"],
  ["Tema financiero urgente", "Directiva → Norberto Elloni"],
];

const eventosFlujo: { titulo: string; desc: string }[] = [
  {
    titulo: "Cliente contacta",
    desc: "Por número corporativo. Nuca recibe la consulta.",
  },
  {
    titulo: "Espacio y presupuesto",
    desc: "La consulta pasa a la Gerente General, que arma propuesta según los espacios de interés.",
  },
  {
    titulo: "Marcas inquilinas",
    desc: "Si aplica colaboración, la Gerente General contacta al inquilino.",
  },
  {
    titulo: "Servicio gastronómico (opcional)",
    desc: "Equipo gastronómico crea propuesta de catering — custom o propuesta de la casa. Chef aprueba.",
  },
  {
    titulo: "Confirmación",
    desc: "Mínimo 2 semanas de anticipación si es posible. Crear evento en la página y lista de tareas.",
  },
  {
    titulo: "Difusión",
    desc: "Si público: Directiva aprueba contenido, Gerente General ejecuta, Redes Sociales publican. Si privado: Gerente General cotiza y cliente ejecuta de la mano de nuestro equipo.",
  },
  {
    titulo: "Ejecución",
    desc: "Equipo apoya según área.",
  },
  {
    titulo: "Cierre",
    desc: "Día siguiente: estado a 'Realizado'. Reportar balance.",
  },
];

const ritmoSemanal: [string, string][] = [
  ["Reunión semanal", "Por definir."],
  [
    "Bloque de foco",
    "De 9:00 am a 11:00 am todo el equipo concentrado en tareas y obligaciones antes de proceder con el día.",
  ],
  [
    "Día a día",
    "Llamada parada de 15 min a las 8:45 am. Cada quien revisa sus tareas en la mañana.",
  ],
  ["Comunicación urgente", "WhatsApp del grupo del equipo."],
  [
    "Regla de oro",
    "Si pasó en La Quinta → tiene que estar registrado. Llamada diaria de 15 min todas las mañanas. Cumplir con la asistencia en las reuniones semanales.",
  ],
];

const inquilinos: [string, string][] = [
  ["Día 1 del mes", "Gerente General envía recordatorio de pago."],
  ["Día 5 sin pago", "Gerente General notifica a Rodrigo."],
  ["Aviso o escalamiento", "Junta Directiva decide siguiente paso."],
  ["Acción legal", "Abogados y Junta Directiva."],
  [
    "Contratos",
    "Gerente General prepara → Abogados revisan → Directiva aprueba.",
  ],
];

const finanzas: [string, string][] = [
  ["Control mensual", "Contadores · ingresos / egresos."],
  ["Aprobación de gastos", "Todo gasto requiere OK de la Junta Directiva."],
  ["Solicitud", "Vía WhatsApp o reunión semanal con monto y justificación."],
  ["Emergencias", "WhatsApp directo a Directiva."],
  ["Nómina", "Mensual · 6 empleados."],
];

const cocina: [string, string][] = [
  ["Día a día", "Gerente de Gastronomía gestiona con autonomía operativa."],
  ["Menús nuevos", "Chef aprueba antes de ofrecer."],
  [
    "Cambio de proveedor o gasto grande",
    "Aprobado por Directiva, Chef y Gerente de Gastronomía.",
  ],
  [
    "Eventos con comida",
    "Gerente General coordina con Gerente de Gastronomía y Chef.",
  ],
  ["Registro de gastos", "Notion → Finanzas & Pagos."],
];

const mantenimiento: [string, string][] = [
  ["Reportar daño", "Equipo de mantenimiento."],
  ["Evaluar y presupuestar", "Gerente de Mantenimiento."],
  ["Aprobación", "Directiva."],
  [
    "Ejecución",
    "Equipo de mantenimiento ejecuta y registra fecha de resolución.",
  ],
  ["Emergencias", "Llamar a Directiva de inmediato."],
];

const community: [string, string][] = [
  ["Contenido semanal", "Nuca propone, Directiva aprueba."],
  ["Stories del día", "Nuca publica con autonomía."],
  ["Eventos", "Comunicar con mínimo 7 días de anticipación."],
  [
    "Mensajes corporativos",
    "Nuca responde de inmediato. Fuera de horario laboral, en 24h hábiles.",
  ],
  ["Temas delicados", "Consultar a la Directiva antes de responder."],
];

function ProtocoloCard({
  title,
  subtitle,
  items,
  color,
}: {
  title: string;
  subtitle?: React.ReactNode;
  items: [string, string][];
  color: string;
}) {
  return (
    <div className={`rounded-2xl ring-1 ${color} p-5`}>
      <h2 className="font-display text-base tracking-[0.15em] uppercase text-cacao">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-2 text-sm italic text-cacao-soft">{subtitle}</p>
      )}
      <dl className="mt-4 divide-y divide-marfil/60">
        {items.map(([label, val]) => (
          <div
            key={label}
            className="py-2 grid grid-cols-1 sm:grid-cols-3 gap-1"
          >
            <dt className="text-sm font-medium text-cacao">{label}</dt>
            <dd className="sm:col-span-2 text-sm text-cacao-soft">{val}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default function ComoTrabajamosPage() {
  return (
    <>
      <Header subtitle="Cómo Trabajamos" />
      <main className="flex-1 mx-auto w-full max-w-3xl px-5 py-10">
        <section className="mb-10 text-center">
          <h1 className="font-display text-2xl sm:text-3xl tracking-[0.2em] uppercase text-cacao">
            Cómo Trabajamos
          </h1>
          <p className="mt-3 text-cacao-soft italic">
            Protocolos cortos para el día a día.
          </p>
        </section>

        <section className="space-y-4">
          <ProtocoloCard
            title="¿A quién acudir?"
            subtitle={
              <>
                Para información detallada de roles, ir a{" "}
                <a
                  href="/la-quinta"
                  className="underline decoration-cacao-mute hover:text-cacao"
                >
                  La Quinta → Equipo
                </a>
                .
              </>
            }
            items={aQuienAcudir}
            color="bg-[#F4E5E2] ring-[#DCB8B0]"
          />

          {/* EVENTOS — mapa visual */}
          <div className="rounded-2xl ring-1 bg-[#F4E5E2] ring-[#DCB8B0] p-5">
            <h2 className="font-display text-base tracking-[0.15em] uppercase text-cacao">
              Eventos
            </h2>
            <p className="mt-2 text-sm italic text-cacao-soft">
              El ciclo completo para generar un evento, paso a paso.
            </p>

            <ol className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {eventosFlujo.map((step, i) => (
                <li
                  key={step.titulo}
                  className="relative bg-white rounded-xl ring-1 ring-[#DCB8B0] p-4 pl-14"
                >
                  <span
                    className="absolute top-3 left-3 size-9 rounded-full bg-terracotta text-white font-display text-base flex items-center justify-center"
                    aria-hidden
                  >
                    {i + 1}
                  </span>
                  <h3 className="font-display text-sm tracking-[0.1em] uppercase text-cacao">
                    {step.titulo}
                  </h3>
                  <p className="mt-1 text-sm text-cacao-soft leading-relaxed">
                    {step.desc}
                  </p>
                </li>
              ))}
            </ol>
          </div>

          <ProtocoloCard
            title="Ritmo Semanal"
            items={ritmoSemanal}
            color="bg-[#F4E5E2] ring-[#DCB8B0]"
          />

          <ProtocoloCard
            title="Inquilinos & Cobros"
            items={inquilinos}
            color="bg-[#F4E5E2] ring-[#DCB8B0]"
          />

          <ProtocoloCard
            title="Finanzas & Pagos"
            items={finanzas}
            color="bg-[#F4E5E2] ring-[#DCB8B0]"
          />

          <ProtocoloCard
            title="Cocina & Gastronomía"
            items={cocina}
            color="bg-[#F4E5E2] ring-[#DCB8B0]"
          />

          <ProtocoloCard
            title="Mantenimiento"
            items={mantenimiento}
            color="bg-[#F4E5E2] ring-[#DCB8B0]"
          />

          <ProtocoloCard
            title="Community & Redes"
            items={community}
            color="bg-[#F4E5E2] ring-[#DCB8B0]"
          />
        </section>

        <p className="mt-12 text-center text-xs uppercase tracking-widest text-cacao-mute">
          Toda decisión importante pasa por la Directiva
        </p>
      </main>
    </>
  );
}
