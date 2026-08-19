import { redirect } from "next/navigation";
import { usuarioAdmin } from "@/lib/supabase/servidor";
import { estadoVigente } from "@/lib/concurso-servidor";
import { cierre, fechaYHora, inicio } from "@/lib/concurso";
import { Barra } from "@/components/admin/Barra";
import { InterruptorConcurso } from "@/components/admin/InterruptorConcurso";
import { PanelSorteos, type Sorteo } from "@/components/admin/PanelSorteos";
import { CORREO_DATOS_SIN_CONFIGURAR } from "@/lib/contacto";

export const dynamic = "force-dynamic";

type Resumen = {
  total: number;
  elegibles: number;
  con_marketing: number;
  rebotes: number;
  quejas: number;
};

type PorPanel = { origen: string; total: number; elegibles: number };

export default async function AdminPage() {
  /*
   * La sesión se verifica acá aunque proxy.ts ya la haya exigido. El matcher
   * del proxy es una lista que hay que acordarse de mantener; esta guardia vive
   * en el mismo archivo que los datos que protege (regla dura 1).
   */
  const { supabase, usuario } = await usuarioAdmin();
  if (!supabase || !usuario) redirect("/admin/login");

  const [estadoRes, resumenRes, panelesRes, sorteosRes] = await Promise.all([
    estadoVigente(),
    supabase.rpc("resumen_inscripciones"),
    supabase.rpc("resumen_por_panel"),
    supabase.rpc("listar_sorteos"),
  ]);

  const resumen = (
    Array.isArray(resumenRes.data) ? resumenRes.data[0] : resumenRes.data
  ) as Resumen | null;
  const paneles = (panelesRes.data ?? []) as PorPanel[];
  const sorteos = (sorteosRes.data ?? []) as Sorteo[];

  const desde = inicio();
  const hasta = cierre();

  return (
    <>
      <Barra correo={usuario.email ?? ""} />

      <main className="adm__cuerpo">
        {CORREO_DATOS_SIN_CONFIGURAR && (
          <p className="aviso aviso--error">
            <strong>Bloqueante legal:</strong> el contacto de datos personales
            sigue siendo <code>datos@example.com</code>. La Ley 21.719 obliga a
            atender por esa vía las solicitudes de acceso y eliminación. Cárgalo
            en <code>NEXT_PUBLIC_CORREO_DATOS</code>.
          </p>
        )}

        <div className="adm__rejilla">
          <InterruptorConcurso
            estado={estadoRes.estado}
            fuente={estadoRes.fuente}
            ventana={{
              inicio: desde ? fechaYHora(desde) : null,
              cierre: hasta ? fechaYHora(hasta) : null,
            }}
          />

          <div className="tarjeta">
            <h2 className="tarjeta__titulo">Inscripciones</h2>
            {resumen ? (
              <div className="cifras">
                <Cifra valor={resumen.total} nombre="Total" />
                <Cifra valor={resumen.elegibles} nombre="Elegibles" />
                <Cifra valor={resumen.con_marketing} nombre="Marketing" />
                <Cifra valor={resumen.rebotes} nombre="Rebotes" />
                <Cifra valor={resumen.quejas} nombre="Quejas" />
              </div>
            ) : (
              <p className="vacio">Sin datos todavía.</p>
            )}
          </div>

          <div className="tarjeta">
            <h2 className="tarjeta__titulo">Por panel</h2>
            {paneles.length === 0 ? (
              <p className="vacio">Sin inscripciones todavía.</p>
            ) : (
              <div className="tabla-caja">
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>Origen</th>
                      <th>Total</th>
                      <th>Elegibles</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paneles.map((p) => (
                      <tr key={p.origen}>
                        <td>{p.origen}</td>
                        <td>{p.total}</td>
                        <td>{p.elegibles}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <PanelSorteos sorteos={sorteos} />
      </main>
    </>
  );
}

function Cifra({ valor, nombre }: { valor: number; nombre: string }) {
  return (
    <div>
      <div className="cifra__valor">{valor.toLocaleString("es-CL")}</div>
      <div className="cifra__nombre">{nombre}</div>
    </div>
  );
}
