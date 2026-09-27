import Image from "next/image";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function Header({ subtitle }: { subtitle?: string }) {
  const hasSupabase =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let email: string | null = null;
  if (hasSupabase) {
    try {
      const supabase = await createSupabaseServerClient();
      const { data } = await supabase.auth.getUser();
      email = data.user?.email ?? null;
    } catch {
      // ignore — header is decorative
    }
  }

  return (
    <header className="border-b border-marfil-light bg-white/80 backdrop-blur sticky top-0 z-10">
      <div className="mx-auto max-w-3xl px-5 py-3 flex items-center justify-between gap-3">
        <Link
          href="/"
          className="flex items-center gap-3 text-cacao"
          aria-label="Inicio"
        >
          <Image
            src="/logo-black.svg"
            alt="La Quinta Mamá"
            width={32}
            height={32}
            className="h-8 w-8"
            priority
          />
          <span className="font-display text-sm tracking-[0.3em] uppercase hidden sm:inline">
            Quinta Mamá
          </span>
        </Link>
        <div className="flex items-center gap-3 text-sm">
          {subtitle && (
            <span className="text-cacao-soft hidden sm:inline">{subtitle}</span>
          )}
          {email && (
            <form action="/api/logout" method="post">
              <button
                type="submit"
                className="text-cacao-soft hover:text-cacao transition-colors"
                aria-label="Cerrar sesión"
                title={`Cerrar sesión (${email})`}
              >
                Salir
              </button>
            </form>
          )}
        </div>
      </div>
    </header>
  );
}
