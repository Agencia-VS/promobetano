import { redirect } from "next/navigation";
import { usuarioAdmin } from "@/lib/supabase/servidor";
import { Barra } from "@/components/admin/Barra";
import { ListaInscripciones } from "@/components/admin/ListaInscripciones";

export const dynamic = "force-dynamic";

export default async function InscripcionesPage() {
  // La guardia se repite en cada página del panel: la del proxy es la primera
  // barrera, no la única (regla dura 1).
  const { usuario } = await usuarioAdmin();
  if (!usuario) redirect("/admin/login");

  return (
    <>
      <Barra correo={usuario.email ?? ""} />
      <main className="adm__cuerpo">
        <ListaInscripciones />
      </main>
    </>
  );
}
