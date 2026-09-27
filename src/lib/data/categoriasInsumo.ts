"use client";

// Categorías de INSUMOS definidas por el usuario (para el Análisis de Compras).
// Espejo de categorias.ts (ventas) pero independiente: el insumo guarda el
// NOMBRE de la categoría en insumos.categoria_compra.
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type CategoriaInsumo = {
  id: string;
  nombre: string;
  orden: number;
  excluirRanking: boolean;
};

type Row = {
  id: string;
  nombre: string;
  orden: number | string | null;
  excluir_ranking?: boolean | null;
};
const toCat = (r: Row): CategoriaInsumo => ({
  id: r.id,
  nombre: r.nombre,
  orden: Number(r.orden ?? 0),
  excluirRanking: !!r.excluir_ranking,
});

/** Lista las categorías (ordenadas). Si la tabla aún no existe, devuelve []. */
export async function listCategoriasInsumo(): Promise<CategoriaInsumo[]> {
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb
    .from("categoria_insumo")
    .select("id, nombre, orden, excluir_ranking")
    .order("orden", { ascending: true })
    .order("nombre", { ascending: true });
  if (error) return [];
  return (data as Row[]).map(toCat);
}

/** Crea una categoría. `orden` la deja al final por defecto. */
export async function createCategoriaInsumo(
  nombre: string,
  orden = 500,
): Promise<CategoriaInsumo> {
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb
    .from("categoria_insumo")
    .insert({ nombre: nombre.trim(), orden })
    .select("id, nombre, orden, excluir_ranking")
    .single();
  if (error) throw error;
  return toCat(data as Row);
}

/** Renombra una categoría y actualiza en cascada los insumos que la usaban
 *  (por nombre exacto en categoria_compra), para que no se pierdan. */
export async function renameCategoriaInsumo(
  id: string,
  nombreViejo: string,
  nombreNuevo: string,
): Promise<void> {
  const sb = createSupabaseBrowserClient();
  const nuevo = nombreNuevo.trim();
  const { error } = await sb
    .from("categoria_insumo")
    .update({ nombre: nuevo })
    .eq("id", id);
  if (error) throw error;
  await sb
    .from("insumos")
    .update({ categoria_compra: nuevo })
    .eq("categoria_compra", nombreViejo);
}

/** Borra una categoría. Los insumos que la tuvieran quedan "sin categoría". */
export async function deleteCategoriaInsumo(id: string): Promise<void> {
  const sb = createSupabaseBrowserClient();
  const { error } = await sb.from("categoria_insumo").delete().eq("id", id);
  if (error) throw error;
}

/** Marca/desmarca una categoría como excluida de los rankings (tops, Pareto).
 *  Sigue contando en totales y en "por categoría". */
export async function setCategoriaInsumoExcluirRanking(
  id: string,
  excluir: boolean,
): Promise<void> {
  const sb = createSupabaseBrowserClient();
  const { error } = await sb
    .from("categoria_insumo")
    .update({ excluir_ranking: excluir })
    .eq("id", id);
  if (error) throw error;
}
