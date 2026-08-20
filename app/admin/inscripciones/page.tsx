import { redirect } from "next/navigation";
import { usuarioAdmin } from "@/lib/supabase/servidor";
import { Barra } from "@/components/admin/Barra";
import {
  ListaInscripciones,
  type OpcionJornada,
} from "@/components/admin/ListaInscripciones";

export const dynamic = "force-dynamic";

export default async function InscripcionesPage() {
  // La guardia se repite en cada página del panel: la del proxy es la primera
  // barrera, no la única (regla dura 1).
  const { supabase, usuario } = await usuarioAdmin();
  if (!supabase || !usuario) redirect("/admin/login");

  // Las jornadas se resuelven en el servidor y viajan como props: son tres filas
  // que no cambian durante la activación, y pedirlas desde el navegador sumaría
  // una petición a cada carga del listado para nada.
  const { data } = await supabase.rpc("resumen_jornadas");
  const jornadas = ((data ?? []) as Array<{ sorteo_id: number; nombre: string }>)
    .map((j) => ({ id: j.sorteo_id, nombre: j.nombre }));

  return (
    <>
      <Barra correo={usuario.email ?? ""} />
      <main className="adm__cuerpo">
        <ListaInscripciones jornadas={jornadas satisfies OpcionJornada[]} />
      </main>
    </>
  );
}
