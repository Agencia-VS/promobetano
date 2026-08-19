"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Screen } from "@/components/Screen";
import { Footer18 } from "@/components/Footer18";
import { InfoBadge } from "@/components/InfoBadge";
import { PasosPerfume, SelloConfirmado } from "@/components/Confirmacion";
import { leeConfirmadoAhora, useConfirmado } from "@/lib/confirmado";
import { CORREO_DATOS } from "@/lib/contacto";

export default function ListoPage() {
  const router = useRouter();
  // useSyncExternalStore + getServerSnapshot: el servidor y el render de
  // hidratación coinciden en null, así que no hay hydration mismatch. Leerlo en
  // un inicializador de useState producía un error #418 en el 100% de las
  // conversiones y forzaba a React a re-renderizar toda la raíz.
  const confirmado = useConfirmado();

  /*
   * Guard: sin confirmación esta pantalla no debe afirmar nada. Antes cualquier
   * visita directa —historial, URL compartida, pestaña restaurada— leía
   * "QUEDASTE DENTRO" y "te mandamos la confirmación", generando reclamos
   * irresolubles de gente que nunca se inscribió.
   *
   * Se lee el store directo y no el valor del hook: durante la hidratación el
   * hook devuelve null por diseño, y usarlo acá expulsaría a quien SÍ se
   * inscribió.
   */
  useEffect(() => {
    /*
     * Se expulsa a /i y no a /inscripcion. Con la ruta interceptora en juego,
     * una navegación de cliente a /inscripcion abre el MODAL, y acá el modal se
     * pintaría sobre una pantalla que se está desmontando: quien nunca se
     * inscribió vería un formulario flotando sobre nada.
     *
     * La portada es además el destino correcto para alguien que llegó a /listo
     * por un marcador o por el historial: ve la campaña y decide, en vez de
     * aterrizar en un formulario sin contexto.
     */
    if (leeConfirmadoAhora() === null) router.replace("/i");
  }, [router]);

  return (
    <Screen
      variant="listo"
      padTop={62}
      padX={26}
      poster={<SelloConfirmado email={confirmado?.email} />}
      accion={
        <>
          <div style={{ marginTop: 24 }}>
            <PasosPerfume />
          </div>

          <div
            style={{
              marginTop: 24,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
            }}
          >
            {/* TODO(§Qué falta 02): fecha del sorteo. */}
            <InfoBadge label="Sorteo" value="Fecha por definir" pending />
            {/* TODO(§Qué falta 03): premio. */}
            <InfoBadge label="Premio" value="Por definir" pending />
          </div>

          <p
            style={{
              margin: "auto 0 0",
              paddingTop: 24,
              fontSize: 13.5,
              lineHeight: 1.6,
              color: "#FFFFFF",
            }}
          >
            No revisamos tu bandeja de spam por ti. Si no llega, escríbenos a{" "}
            <a href={`mailto:${CORREO_DATOS}`}>{CORREO_DATOS}</a>.
          </p>
        </>
      }
      pie={
        <Footer18>
          Juega con responsabilidad.{" "}
          <Link href="/bases">Bases y condiciones</Link>
        </Footer18>
      }
    />
  );
}
