"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Screen } from "@/components/Screen";
import { Footer18 } from "@/components/Footer18";
import { InfoBadge } from "@/components/InfoBadge";
import { PasosPerfume, SelloConfirmado } from "@/components/Confirmacion";
import { AvisoPruebas } from "@/components/AvisoPruebas";
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
          {/* El alta fue un ensayo: se dice acá también. Esta es la pantalla que
              la persona se lleva como prueba de que quedó inscrita, y el aviso
              del formulario ya no está a la vista. Sale del payload del alta y
              no del estado actual del modo: apagarlo después no convierte en
              real una inscripción que se va a borrar. */}
          {confirmado?.pruebas && (
            <div style={{ marginTop: 24 }}>
              <AvisoPruebas />
            </div>
          )}

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
            {/*
              A qué sorteo entró, tal como lo devolvió el alta. Hay un sorteo por
              día a las 21:00, así que quien envía el formulario a las 21:30 entra
              al del día siguiente: sin esta placa se queda esperando un resultado
              que no le corresponde.

              El respaldo "Fecha por definir" cubre el payload de una versión
              anterior guardado en sessionStorage, no un dato que falte.
            */}
            <InfoBadge
              label="Sorteo"
              value={confirmado?.sorteo ?? "Fecha por definir"}
              pending={!confirmado?.sorteo}
            />
            {/* TODO(decisión 03): el premio sigue sin definirse. */}
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
