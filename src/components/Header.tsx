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
    <header className="border-b border-marfil bg-marfil-soft/85 backdrop-blur sticky top-0 z-10">
      <div className="mx-auto max-w-3xl px-5 py-2.5 flex items-center justify-between gap-3">
        <Link href="/" className="flex items-center" aria-label="Inicio">
          <Image
            src="/bolo-logo.png"
            alt="bolo"
            width={200}
            height={80}
            className="h-7 w-auto sm:h-8"
            priority
          />
        </Link>
        <div className="flex items-center gap-3 text-sm">
          {subtitle && (
            <span className="text-cacao-soft font-semibold hidden sm:inline">
              {subtitle}
            </span>
          )}
          {email && (
            <form action="/api/logout" method="post">
              <button
                type="submit"
                className="rounded-full px-3 py-1 text-cacao-soft hover:text-navy hover:bg-marfil-light transition-colors"
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
