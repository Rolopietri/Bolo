import { AsistenteBolo } from "./_AsistenteBolo";

// Monta el asistente (burbujita de ayuda) en todas las páginas de Cocina.
export default function CocinaLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <AsistenteBolo />
    </>
  );
}
