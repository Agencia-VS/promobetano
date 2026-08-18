import { headers } from "next/headers";
import { FormularioInscripcion } from "@/components/FormularioInscripcion";
import { HEADER_ORIGEN, ORIGEN_DIRECTO } from "@/lib/origen";

/**
 * El origen lo resuelve proxy.ts (la URL manda sobre la cookie) y llega por
 * header. Antes esta página parseaba el ?p= por su cuenta y el cliente leía la
 * cookie con la precedencia invertida.
 */
export default async function InscripcionPage() {
  const h = await headers();
  const origen = h.get(HEADER_ORIGEN) ?? ORIGEN_DIRECTO;
  return <FormularioInscripcion origen={origen} />;
}
