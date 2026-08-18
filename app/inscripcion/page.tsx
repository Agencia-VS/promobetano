import { FormularioInscripcion } from "@/components/FormularioInscripcion";
import { ORIGEN_DEFAULT } from "@/lib/origen";

export default async function InscripcionPage({
  searchParams,
}: PageProps<"/inscripcion">) {
  const params = await searchParams;
  const p = params.p;
  const slug = (Array.isArray(p) ? p[0] : p) || ORIGEN_DEFAULT;

  return <FormularioInscripcion origenInicial={slug} />;
}
