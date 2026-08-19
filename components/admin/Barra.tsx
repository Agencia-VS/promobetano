"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabaseNavegador } from "@/lib/supabase/navegador";

export function Barra({ correo }: { correo: string }) {
  const router = useRouter();
  const ruta = usePathname();

  async function salir() {
    await supabaseNavegador()?.auth.signOut();
    router.refresh();
    router.push("/admin/login");
  }

  return (
    <header className="adm__barra">
      <span className="adm__marca">Eau de Confianza · Panel</span>
      <nav className="adm__nav">
        <Link href="/admin" aria-current={ruta === "/admin" ? "page" : undefined}>
          Resumen
        </Link>
        <Link
          href="/admin/inscripciones"
          aria-current={ruta === "/admin/inscripciones" ? "page" : undefined}
        >
          Inscripciones
        </Link>
        <span
          style={{
            fontSize: 12,
            color: "rgba(249,241,233,.5)",
            marginInline: 10,
          }}
        >
          {correo}
        </span>
        <button type="button" className="btn btn--chico" onClick={salir}>
          Salir
        </button>
      </nav>
    </header>
  );
}
