import { FormularioLogin } from "@/components/admin/FormularioLogin";

export const dynamic = "force-dynamic";

// PageProps<"..."> se apoya en los tipos de ruta que Next genera al compilar, y
// una ruta nueva todavía no existe ahí en el primer typecheck.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const sinConfigurar = params.error === "config";

  return (
    <main className="login">
      <div className="login__caja">
        <p className="adm__marca">Eau de Confianza · Panel</p>
        {sinConfigurar ? (
          <p className="aviso aviso--error">
            Faltan las variables de Supabase en el entorno. Sin ellas no se
            puede autenticar a nadie.
          </p>
        ) : (
          <FormularioLogin />
        )}
      </div>
    </main>
  );
}
