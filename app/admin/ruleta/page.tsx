import { redirect } from "next/navigation";
import { usuarioAdmin } from "@/lib/supabase/servidor";
import { Barra } from "@/components/admin/Barra";
import {
  PanelRuleta,
  type GanadorRuleta,
  type JornadaRuleta,
} from "@/components/admin/PanelRuleta";

export const dynamic = "force-dynamic";

export default async function AdminRuletaPage() {
  const { supabase, usuario } = await usuarioAdmin();
  if (!supabase || !usuario) redirect("/admin/login");

  const [estado, ganadores, pruebas] = await Promise.all([
    supabase.rpc("estado_ruleta_admin"),
    supabase.rpc("listar_ganadores_ruleta"),
    supabase.rpc("estado_ruleta_pruebas_admin"),
  ]);

  const error = estado.error?.message ?? ganadores.error?.message ?? null;

  return (
    <>
      <Barra correo={usuario.email ?? ""} />
      <main className="adm__cuerpo">
        <div>
          <h1 className="adm__titulo-pagina">Ruleta instantánea</h1>
          <p className="adm__bajada">
            Stock, ritmo, ventanas y lista correlativa de ganadores. Todas las
            horas se interpretan en America/Santiago.
          </p>
        </div>

        {error ? (
          <p className="aviso aviso--error">
            No se pudo leer la ruleta. Aplica la migración del hotfix y recarga.
          </p>
        ) : (
          <PanelRuleta
            jornadas={(estado.data ?? []) as JornadaRuleta[]}
            ganadores={(ganadores.data ?? []) as GanadorRuleta[]}
            pruebas={((pruebas.data ?? [])[0] ?? null) as JornadaRuleta | null}
            pruebasNoDisponibles={Boolean(pruebas.error)}
          />
        )}
      </main>
    </>
  );
}
