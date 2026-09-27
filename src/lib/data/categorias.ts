"use client";

// Categorías de producto definidas por el usuario (para clasificar ventas).
// Se gestionan desde la página y se comparten entre módulos. El producto guarda
// el NOMBRE de la categoría en su campo `categoria`.
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type CategoriaProducto = {
  id: string;
  nombre: string;
  orden: number;
  excluirRanking: boolean;
  /** true = es categoría de RECETA/menú (aparece en el Recetario). false = solo
   *  Ventas (alquileres, pádel, reventa, consignación). undefined = la columna
   *  aún no existe en DB (migración pendiente) → se trata como visible. */
  aplicaReceta?: boolean;
  /** Rubro administrativo: nombre bajo el que esta categoría se AGRUPA en el
   *  análisis de Administración (p. ej. Smoothies + Bebidas naturales → un solo
   *  rubro). En Recetas/Cocina la categoría se usa tal cual. null/undefined = no
   *  se agrupa (se muestra con su propio nombre). */
  rubro?: string | null;
};

type Row = { id: string; nombre: string; orden: number | string | null; excluir_ranking?: boolean | null; aplica_receta?: boolean | null; rubro?: string | null };
const toCat = (r: Row): CategoriaProducto => ({
  id: r.id,
  nombre: r.nombre,
  orden: Number(r.orden ?? 0),
  excluirRanking: !!r.excluir_ranking,
  aplicaReceta: r.aplica_receta == null ? undefined : !!r.aplica_receta,
  rubro: r.rubro && r.rubro.trim() ? r.rubro.trim() : null,
});

/** Lista las categorías (ordenadas). Si la tabla aún no existe, devuelve []. */
export async function listCategoriasProducto(): Promise<CategoriaProducto[]> {
  const sb = createSupabaseBrowserClient();
  // Intento con TODAS las columnas nuevas (excluir_ranking, aplica_receta,
  // rubro). Si alguna migración aún no corrió, reintento con menos columnas
  // para no romper (sin perder las que sí existen).
  const conRubro = await sb
    .from("categoria_producto")
    .select("id, nombre, orden, excluir_ranking, aplica_receta, rubro")
    .order("orden", { ascending: true })
    .order("nombre", { ascending: true });
  if (!conRubro.error) return (conRubro.data as Row[]).map(toCat);
  const full = await sb
    .from("categoria_producto")
    .select("id, nombre, orden, excluir_ranking, aplica_receta")
    .order("orden", { ascending: true })
    .order("nombre", { ascending: true });
  if (!full.error) return (full.data as Row[]).map(toCat);
  const conFlag = await sb
    .from("categoria_producto")
    .select("id, nombre, orden, excluir_ranking")
    .order("orden", { ascending: true })
    .order("nombre", { ascending: true });
  if (!conFlag.error) return (conFlag.data as Row[]).map(toCat);
  const base = await sb
    .from("categoria_producto")
    .select("id, nombre, orden")
    .order("orden", { ascending: true })
    .order("nombre", { ascending: true });
  if (base.error) return [];
  return (base.data as Row[]).map(toCat);
}

/** Marca/desmarca una categoría como excluida de los rankings (más vendido,
 *  mayor facturación, tops). Sigue contando en totales y "por categoría". */
export async function setCategoriaExcluirRanking(id: string, excluir: boolean): Promise<void> {
  const sb = createSupabaseBrowserClient();
  const { error } = await sb.from("categoria_producto").update({ excluir_ranking: excluir }).eq("id", id);
  if (error) throw error;
}

/** Crea una categoría. `orden` la deja al final por defecto. `aplicaReceta`
 *  marca si es categoría de menú (visible en el Recetario) — al crearla desde el
 *  formulario de receta se pasa true. Si la columna aún no existe, reintenta sin
 *  ella para no romper. */
export async function createCategoriaProducto(
  nombre: string,
  orden = 500,
  aplicaReceta?: boolean,
): Promise<CategoriaProducto> {
  const sb = createSupabaseBrowserClient();
  const payload: Record<string, unknown> = { nombre: nombre.trim(), orden };
  if (aplicaReceta !== undefined) payload.aplica_receta = aplicaReceta;
  const conFlag = await sb
    .from("categoria_producto")
    .insert(payload)
    .select("id, nombre, orden, excluir_ranking, aplica_receta")
    .single();
  if (!conFlag.error) return toCat(conFlag.data as Row);
  // Reintento sin la columna nueva (migración pendiente).
  const { data, error } = await sb
    .from("categoria_producto")
    .insert({ nombre: nombre.trim(), orden })
    .select("id, nombre, orden")
    .single();
  if (error) throw error;
  return toCat(data as Row);
}

/** Marca/desmarca una categoría como "de receta" (visible en el Recetario). */
export async function setCategoriaAplicaReceta(id: string, aplica: boolean): Promise<void> {
  const sb = createSupabaseBrowserClient();
  const { error } = await sb.from("categoria_producto").update({ aplica_receta: aplica }).eq("id", id);
  if (error) throw error;
}

/** Renombra una categoría y actualiza en cascada los productos que la usaban
 *  (recetas e insumos con ese nombre exacto), para que no se pierdan. */
export async function renameCategoriaProducto(id: string, nombreViejo: string, nombreNuevo: string): Promise<void> {
  const sb = createSupabaseBrowserClient();
  const nuevo = nombreNuevo.trim();
  const { error } = await sb.from("categoria_producto").update({ nombre: nuevo }).eq("id", id);
  if (error) throw error;
  await sb.from("recetas").update({ categoria: nuevo }).eq("categoria", nombreViejo);
  await sb.from("insumos").update({ categoria: nuevo }).eq("categoria", nombreViejo);
}

/** Borra una categoría. Los productos que la tuvieran quedan "sin categoría". */
export async function deleteCategoriaProducto(id: string): Promise<void> {
  const sb = createSupabaseBrowserClient();
  const { error } = await sb.from("categoria_producto").delete().eq("id", id);
  if (error) throw error;
}
