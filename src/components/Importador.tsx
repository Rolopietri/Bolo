"use client";

import { useMemo, useState } from "react";

/**
 * Importador reutilizable: sube un Excel/CSV, detecta las columnas, deja que el
 * usuario mapee cada campo, muestra una vista previa y crea todo en lote.
 * Sirve para cualquier módulo (insumos, proveedores, facturas…): el padre define
 * los `campos` y qué hacer con las filas en `onImportar`.
 *
 * Lee el archivo en el navegador con SheetJS (import dinámico), igual que el
 * conteo físico — maneja .xlsx/.xls/.csv sin pasar por el servidor.
 */
export type CampoImport = {
  key: string;
  label: string;
  required?: boolean;
  tipo?: "texto" | "numero";
  /** Palabras para auto-detectar la columna por su encabezado. */
  alias?: string[];
};

type Fila = Record<string, unknown>;

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

function matchHeader(header: string, campo: CampoImport): boolean {
  const h = norm(header);
  const claves = [campo.label, campo.key, ...(campo.alias ?? [])].map(norm);
  return claves.some((k) => k && (h === k || h.includes(k) || k.includes(h)));
}

export function Importador({
  titulo,
  descripcion,
  campos,
  onImportar,
  onCerrar,
}: {
  titulo: string;
  descripcion?: string;
  campos: CampoImport[];
  onImportar: (filas: Record<string, unknown>[]) => Promise<{ ok: number; errores: number }>;
  onCerrar: () => void;
}) {
  const [filas, setFilas] = useState<Fila[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapa, setMapa] = useState<Record<string, string>>({});
  const [leyendo, setLeyendo] = useState(false);
  const [importando, setImportando] = useState(false);
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState<{ ok: number; errores: number } | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setError("");
    setResultado(null);
    setLeyendo(true);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) throw new Error("El archivo no tiene ninguna hoja.");
      const rows = XLSX.utils.sheet_to_json<Fila>(ws, { defval: "" });
      if (rows.length === 0) throw new Error("El archivo está vacío.");
      const hs = Object.keys(rows[0]);
      setFilas(rows);
      setHeaders(hs);
      const m: Record<string, string> = {};
      for (const c of campos) {
        const found = hs.find((h) => matchHeader(h, c));
        if (found) m[c.key] = found;
      }
      setMapa(m);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pude leer el archivo.");
    } finally {
      setLeyendo(false);
    }
  }

  function valorDe(row: Fila, campo: CampoImport): unknown {
    const h = mapa[campo.key];
    if (!h) return undefined;
    const raw = row[h];
    if (raw == null) return undefined;
    const s = String(raw).trim();
    if (s === "") return undefined;
    if (campo.tipo === "numero") {
      if (typeof raw === "number") return raw; // celda ya numérica (Excel)
      let t = s.replace(/[^0-9.,-]/g, "");
      if (t.includes(".") && t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
      else if (t.includes(",")) t = t.replace(",", ".");
      const n = Number(t);
      return Number.isFinite(n) ? n : undefined;
    }
    return s;
  }

  const filasMapeadas = useMemo(
    () =>
      filas.map((r) => {
        const o: Record<string, unknown> = {};
        for (const c of campos) o[c.key] = valorDe(r, c);
        return o;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filas, mapa],
  );

  const requeridos = campos.filter((c) => c.required);
  const validas = useMemo(
    () => filasMapeadas.filter((r) => requeridos.every((c) => r[c.key] != null && r[c.key] !== "")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filasMapeadas],
  );
  const faltanRequeridos = requeridos.filter((c) => !mapa[c.key]);

  async function importar() {
    setError("");
    setImportando(true);
    try {
      const res = await onImportar(validas);
      setResultado(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo importar.");
    } finally {
      setImportando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="w-full sm:max-w-xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white">
        <div className="sticky top-0 z-10 flex items-center justify-between bg-white/95 backdrop-blur px-5 py-3.5 border-b border-marfil">
          <span className="font-cinzel text-lg text-cacao">{titulo}</span>
          <button
            onClick={onCerrar}
            aria-label="Cerrar"
            className="rounded-full ring-1 ring-marfil size-9 grid place-items-center text-cacao-soft hover:text-cacao"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4">
          {descripcion && !resultado && (
            <p className="text-sm text-cacao-soft">{descripcion}</p>
          )}

          {/* Resultado */}
          {resultado ? (
            <div className="text-center py-4">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#E4F3EA] text-[#2E9E5B] text-2xl">
                ✓
              </div>
              <h3 className="mt-3 font-cinzel text-xl text-cacao">¡Listo!</h3>
              <p className="mt-1 text-cacao-soft">
                Se crearon <b>{resultado.ok}</b>{" "}
                {resultado.ok === 1 ? "registro" : "registros"}
                {resultado.errores > 0 && (
                  <>
                    {" "}
                    · <span className="text-[#D64534]">{resultado.errores} con problemas</span>
                  </>
                )}
                .
              </p>
              <button
                onClick={onCerrar}
                className="mt-5 w-full rounded-xl bg-terracotta text-white py-3 font-bold hover:bg-terracotta-deep transition-colors"
              >
                Terminar
              </button>
            </div>
          ) : filas.length === 0 ? (
            /* Paso 1: subir archivo */
            <label className="block rounded-2xl border-2 border-dashed border-marfil bg-marfil-soft p-8 text-center cursor-pointer hover:border-terracotta transition-colors">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-white ring-1 ring-marfil text-terracotta-deep text-xl">
                ↑
              </div>
              <p className="mt-3 font-bold text-cacao">
                {leyendo ? "Leyendo archivo…" : "Toca para subir tu Excel o CSV"}
              </p>
              <p className="mt-1 text-xs text-cacao-mute">.xlsx · .xls · .csv</p>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={onFile}
                disabled={leyendo}
                className="hidden"
              />
            </label>
          ) : (
            /* Paso 2: mapear + vista previa */
            <>
              <div>
                <p className="text-sm font-bold text-cacao-soft mb-2">
                  ¿Qué columna es cada dato?
                </p>
                <div className="space-y-2">
                  {campos.map((c) => (
                    <div key={c.key} className="flex items-center gap-3">
                      <span className="w-32 shrink-0 text-sm font-bold text-cacao">
                        {c.label}
                        {c.required && <span className="text-terracotta"> *</span>}
                      </span>
                      <select
                        value={mapa[c.key] ?? ""}
                        onChange={(e) =>
                          setMapa((m) => ({ ...m, [c.key]: e.target.value }))
                        }
                        className="flex-1 min-w-0 rounded-lg ring-1 ring-marfil bg-white px-2.5 py-2 text-cacao focus:outline-none focus:ring-2 focus:ring-terracotta"
                      >
                        <option value="">— ninguna —</option>
                        {headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Vista previa */}
              <div>
                <p className="text-sm font-bold text-cacao-soft mb-2">
                  Vista previa ({validas.length} de {filas.length} filas listas)
                </p>
                <div className="overflow-x-auto rounded-xl ring-1 ring-marfil">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-marfil-soft text-cacao-soft">
                        {campos.map((c) => (
                          <th key={c.key} className="text-left font-bold px-3 py-2 whitespace-nowrap">
                            {c.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {validas.slice(0, 6).map((r, i) => (
                        <tr key={i} className="border-t border-marfil-light">
                          {campos.map((c) => (
                            <td key={c.key} className="px-3 py-2 text-cacao whitespace-nowrap">
                              {r[c.key] == null ? <span className="text-cacao-mute">—</span> : String(r[c.key])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {faltanRequeridos.length > 0 && (
                <div className="rounded-lg bg-[#FBEEDD] ring-1 ring-[#F0D4A6] p-3 text-sm text-[#8A5A12]">
                  Falta indicar la columna de:{" "}
                  <b>{faltanRequeridos.map((c) => c.label).join(", ")}</b>.
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setFilas([]);
                    setHeaders([]);
                    setMapa({});
                  }}
                  className="rounded-xl ring-1 ring-marfil px-4 py-3 font-bold text-cacao hover:bg-marfil-soft"
                >
                  Otro archivo
                </button>
                <button
                  onClick={importar}
                  disabled={importando || validas.length === 0 || faltanRequeridos.length > 0}
                  className="flex-1 rounded-xl bg-terracotta text-white py-3 font-bold hover:bg-terracotta-deep disabled:opacity-50 transition-colors"
                >
                  {importando ? "Importando…" : `Importar ${validas.length} filas`}
                </button>
              </div>
            </>
          )}

          {error && (
            <div className="rounded-lg bg-[#FBE5E1] ring-1 ring-[#F3CFC8] p-3 text-sm text-[#A5341F]">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
