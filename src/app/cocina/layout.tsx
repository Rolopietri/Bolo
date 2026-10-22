import { AsistenteBolo } from "./_AsistenteBolo";
import { GuiaCursor } from "./_GuiaCursor";

// Monta el asistente (burbujita de ayuda) y el cursor-guía en todas las
// páginas de Cocina.
export default function CocinaLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <AsistenteBolo />
      <GuiaCursor />
    </>
  );
}
