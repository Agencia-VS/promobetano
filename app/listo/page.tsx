"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Screen } from "@/components/Screen";
import { Footer18 } from "@/components/Footer18";
import { InfoBadge } from "@/components/InfoBadge";
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
    if (leeConfirmadoAhora() === null) router.replace("/inscripcion");
  }, [router]);

  return (
    <Screen
      variant="listo"
      padTop={62}
      padX={26}
      poster={
        <div
          className="bloque-centrado-movil"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 20,
            padding: "24px 0 8px",
          }}
        >
          <span
            aria-hidden
            style={{
              width: 60,
              height: 60,
              border: "1px solid rgba(255,255,255,.7)",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 24,
              color: "#FFFFFF",
              flexShrink: 0,
            }}
          >
            ✓
          </span>
          <h1
            style={{
              margin: 0,
              fontFamily: "var(--font-title)",
              fontWeight: 800,
              fontSize: "clamp(30px, 3.4vw, 46px)",
              lineHeight: 1.04,
              letterSpacing: ".06em",
              textTransform: "uppercase",
              color: "#FFFFFF",
            }}
          >
            Quedaste dentro
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: "clamp(15px, 1.1vw, 17.5px)",
              lineHeight: 1.6,
              color: "#FFFFFF",
              maxWidth: "34ch",
            }}
          >
            {confirmado ? (
              <>
                Te mandamos la confirmación a{" "}
                <strong style={{ fontWeight: 500 }}>{confirmado.email}</strong>.
                Llega en menos de un minuto.
              </>
            ) : (
              "Te mandamos la confirmación a tu correo. Llega en menos de un minuto."
            )}
          </p>
        </div>
      }
      accion={
        <>
          <div
            style={{
              marginTop: 24,
              background: "var(--color-ink)",
              padding: "22px 20px",
              display: "flex",
              flexDirection: "column",
              gap: 18,
              boxShadow: "0 14px 36px rgba(60,0,0,.4)",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-title)",
                fontSize: 10.5,
                letterSpacing: ".3em",
                textTransform: "uppercase",
                color: "var(--color-confianza)",
              }}
            >
              Si te lo ganas, así se usa
            </span>
            <ol
              style={{
                margin: 0,
                padding: 0,
                listStyle: "none",
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              <Paso n="01">Abre la botella.</Paso>
              <Paso n="02">Susúrrate: «tú puedes».</Paso>
              <Paso n="03">Échate bastante y con confianza.</Paso>
            </ol>
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

function Paso({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <li style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
      <span
        style={{
          fontFamily: "var(--font-title)",
          fontWeight: 800,
          fontSize: 13,
          color: "var(--color-confianza)",
          minWidth: 18,
        }}
      >
        {n}
      </span>
      <span style={{ fontSize: 15, lineHeight: 1.5, color: "var(--color-bone)" }}>
        {children}
      </span>
    </li>
  );
}
