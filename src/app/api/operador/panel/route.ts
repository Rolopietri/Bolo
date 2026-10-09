import { NextResponse, type NextRequest } from "next/server";
import { tokenValido, OPERADOR_COOKIE } from "@/lib/operador-auth";
import { createServiceClient } from "@/lib/supabase/admin-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function autorizado(req: NextRequest): boolean {
  return tokenValido(req.cookies.get(OPERADOR_COOKIE)?.value);
}

type DenRow = {
  anuncio_id: string;
  motivo: string;
  detalle: string | null;
  created_at: string;
};
type AnuncioRow = {
  id: string;
  titulo: string;
  tipo: string;
  contacto_nombre: string | null;
  ciudad: string | null;
  activo: boolean;
  foto_url: string | null;
};

export async function GET(req: NextRequest) {
  if (!autorizado(req)) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }
  const sb = createServiceClient();
  if (!sb) {
    return NextResponse.json(
      { error: "Falta la llave de servicio en Vercel." },
      { status: 503 },
    );
  }

  const [anunciosC, denunciasC, resenasC] = await Promise.all([
    sb.from("marketplace_anuncios").select("*", { count: "exact", head: true }),
    sb.from("marketplace_denuncias").select("*", { count: "exact", head: true }),
    sb.from("marketplace_resenas").select("*", { count: "exact", head: true }),
  ]);

  const { data: densData } = await sb
    .from("marketplace_denuncias")
    .select("*")
    .order("created_at", { ascending: false });
  const denuncias = (densData ?? []) as DenRow[];

  const ids = [...new Set(denuncias.map((d) => d.anuncio_id))];
  let anuncios: AnuncioRow[] = [];
  if (ids.length) {
    const { data } = await sb.from("marketplace_anuncios").select("*").in("id", ids);
    anuncios = (data ?? []) as AnuncioRow[];
  }
  const porId = new Map(anuncios.map((a) => [a.id, a]));

  type Grupo = {
    anuncioId: string;
    anuncio: AnuncioRow | null;
    count: number;
    motivos: { motivo: string; detalle: string | null; fecha: string }[];
  };
  const grupos: Grupo[] = [];
  const seen = new Map<string, Grupo>();
  for (const d of denuncias) {
    let g = seen.get(d.anuncio_id);
    if (!g) {
      g = { anuncioId: d.anuncio_id, anuncio: porId.get(d.anuncio_id) ?? null, count: 0, motivos: [] };
      seen.set(d.anuncio_id, g);
      grupos.push(g);
    }
    g.count++;
    g.motivos.push({ motivo: d.motivo, detalle: d.detalle, fecha: d.created_at });
  }

  return NextResponse.json({
    resumen: {
      anuncios: anunciosC.count ?? 0,
      denuncias: denunciasC.count ?? 0,
      resenas: resenasC.count ?? 0,
      anunciosDenunciados: grupos.length,
    },
    grupos,
  });
}
