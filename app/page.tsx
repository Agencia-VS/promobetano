import { redirect } from "next/navigation";

/**
 * El flujo real entra por /i?p={slug} desde el QR del panel. La raíz solo
 * redirige, pero PRESERVANDO el query string: `redirect("/i")` a secas lo
 * descartaba, así que cualquier QR impreso contra la raíz del dominio perdía
 * su ?p= y se acreditaba al panel por defecto sin ninguna señal.
 */
export default async function RootPage({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) v.forEach((x) => qs.append(k, x));
    else if (v !== undefined) qs.set(k, v);
  }
  const cola = qs.toString();
  redirect(cola ? `/i?${cola}` : "/i");
}
