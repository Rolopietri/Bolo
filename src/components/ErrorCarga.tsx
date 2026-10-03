import { ErrorBanner } from "./ErrorBanner";

/** Aviso de error al CARGAR datos de una pantalla, con botón "Reintentar".
 *
 *  Distingue tres situaciones para que un fallo nunca parezca una lista vacía:
 *  - sin datos previos: "No se pudo cargar…" (la pantalla no muestra cifras);
 *  - con datos previos (`desactualizado`): "No se pudo actualizar…", y lo que
 *    se ve es de la última carga correcta.
 *  `detalle` es el mensaje técnico del error, en letra pequeña. */
export function ErrorCarga({
  que = "la información",
  detalle,
  onReintentar,
  reintentando = false,
  desactualizado = false,
  className = "",
}: {
  /** Qué se estaba cargando, ej. "los insumos". */
  que?: string;
  detalle?: string | null;
  onReintentar: () => void;
  reintentando?: boolean;
  desactualizado?: boolean;
  className?: string;
}) {
  return (
    <ErrorBanner className={className}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">
            {desactualizado
              ? `No se pudo actualizar ${que}. Lo que ves es de la última carga y puede no estar al día.`
              : `No se pudo cargar ${que}. Revisa tu conexión e inténtalo de nuevo.`}
          </p>
          {detalle ? (
            <p className="mt-1 text-xs opacity-80 break-words">{detalle}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onReintentar}
          disabled={reintentando}
          className="shrink-0 rounded-full ring-1 ring-[#E8C5BC] bg-white px-3 py-1 text-[11px] uppercase tracking-widest hover:bg-[#FCF4F2] disabled:opacity-50"
        >
          {reintentando ? "Reintentando…" : "Reintentar"}
        </button>
      </div>
    </ErrorBanner>
  );
}
