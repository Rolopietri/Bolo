"use client";

/**
 * Modal de confirmación in-page reutilizable. Reemplaza al confirm() nativo
 * del navegador, que en mobile a veces se "traga" (no aparece). Mantiene la
 * doble confirmación: el usuario tiene que tocar el botón de confirmar.
 *
 * Uso típico:
 *   const [confirm, setConfirm] = useState<string | null>(null);
 *   ...
 *   <button onClick={() => setConfirm(id)}>Eliminar</button>
 *   <ConfirmDialog
 *     open={confirm !== null}
 *     title="¿Eliminar item?"
 *     message="Esta acción no se puede deshacer."
 *     onConfirm={() => { if (confirm) doDelete(confirm); setConfirm(null); }}
 *     onCancel={() => setConfirm(null)}
 *   />
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Sí, eliminar",
  cancelLabel = "Cancelar",
  onConfirm,
  onCancel,
  busy = false,
  danger = true,
}: {
  open: boolean;
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  danger?: boolean;
}) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-cacao/40 backdrop-blur-sm"
      onClick={() => !busy && onCancel()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="rounded-2xl bg-white ring-1 ring-marfil p-6 max-w-md w-full shadow-xl"
      >
        <h2 className="font-cinzel text-xl tracking-[0.08em] text-cacao">
          {title}
        </h2>
        {message && (
          <div className="mt-3 text-sm text-cacao-soft font-serif">
            {message}
          </div>
        )}
        <div className="mt-5 flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-xl ring-1 ring-marfil px-4 py-2 text-cacao hover:bg-marfil-soft disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`rounded-xl text-white px-4 py-2 font-medium disabled:opacity-50 ${
              danger
                ? "bg-terracotta hover:bg-cacao"
                : "bg-cacao hover:bg-terracotta"
            }`}
          >
            {busy ? "Procesando..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
