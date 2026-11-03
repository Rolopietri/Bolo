import type { EstadoCaja } from "@/lib/cierre-caja";

const ESTILO: Record<EstadoCaja, { caja: string; punto: string }> = {
  cuadra: { caja: "bg-[#F1F4ED] text-[#2F4A1F] ring-[#C9D6BC]", punto: "bg-[#2F4A1F]" },
  sobra: { caja: "bg-[#FBF3E4] text-[#8A5A12] ring-[#E6D3A8]", punto: "bg-[#C4892A]" },
  falta: { caja: "bg-[#F9EBE7] text-[#7A2419] ring-[#E8C5BC]", punto: "bg-[#7A2419]" },
  sin_tasa: { caja: "bg-marfil-soft text-cacao ring-marfil", punto: "bg-cacao-mute" },
  vacio: { caja: "bg-white text-cacao-soft ring-marfil", punto: "bg-cacao-mute" },
};

export function EstadoCajaPill({ estado, titulo }: { estado: EstadoCaja; titulo: string }) {
  const e = ESTILO[estado];
  return (
    <span className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ring-1 ${e.caja}`}>
      <span className={`size-1.5 shrink-0 rounded-full ${e.punto}`} aria-hidden />
      <span className="truncate">{titulo}</span>
    </span>
  );
}
