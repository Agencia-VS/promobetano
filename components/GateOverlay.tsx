"use client";

import { useState } from "react";
import { setSessionFlag, useSessionFlag } from "@/lib/sessionFlag";

const STORAGE_KEY = "edc_18_ok";

/**
 * Puerta 18+ de la portada. `useSessionFlag` espeja sessionStorage: en SSR
 * no existe, así que el snapshot de servidor es `false` (la puerta se
 * muestra) y el cliente corrige al hidratar si ya se confirmó antes en esta
 * sesión — sin el flash de contenido que daría leerlo en un efecto.
 */
export function GateOverlay() {
  const confirmado = useSessionFlag(STORAGE_KEY);
  const [salio, setSalio] = useState(false);

  if (confirmado) return null;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 40,
        background: "rgba(10,6,5,.9)",
        backdropFilter: "blur(6px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 22,
        padding: "40px 30px",
        boxSizing: "border-box",
        textAlign: "center",
      }}
    >
      {salio ? (
        <>
          <h2
            style={{
              margin: 0,
              fontFamily: "var(--font-title)",
              fontWeight: 800,
              fontSize: 24,
              lineHeight: 1.1,
              letterSpacing: ".06em",
              textTransform: "uppercase",
              color: "var(--color-bone)",
            }}
          >
            Esta promoción es solo para mayores de 18 años
          </h2>
          <p
            style={{
              margin: 0,
              fontSize: 14.5,
              lineHeight: 1.6,
              color: "rgba(249,241,233,.62)",
              maxWidth: "28ch",
            }}
          >
            Puedes cerrar esta pestaña.
          </p>
        </>
      ) : (
        <>
          <span
            style={{
              width: 54,
              height: 54,
              border: "1px solid rgba(255,57,0,.7)",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "var(--font-title)",
              fontWeight: 800,
              fontSize: 17,
              color: "var(--color-confianza)",
            }}
          >
            18+
          </span>
          <h2
            style={{
              margin: 0,
              fontFamily: "var(--font-title)",
              fontWeight: 800,
              fontSize: 24,
              lineHeight: 1.1,
              letterSpacing: ".06em",
              textTransform: "uppercase",
              color: "var(--color-bone)",
            }}
          >
            ¿Tienes 18 años o más?
          </h2>
          <p
            style={{
              margin: 0,
              fontSize: 14.5,
              lineHeight: 1.6,
              color: "rgba(249,241,233,.62)",
              maxWidth: "28ch",
            }}
          >
            Esta promoción es solo para mayores de edad. Al continuar lo
            confirmas.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
            <button
              type="button"
              onClick={() => setSessionFlag(STORAGE_KEY, true)}
              style={{
                height: 52,
                background: "var(--color-confianza)",
                color: "#FFFFFF",
                border: "none",
                borderRadius: 3,
                fontFamily: "var(--font-title)",
                fontWeight: 800,
                fontSize: 14.5,
                letterSpacing: ".16em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              Sí, tengo 18 o más
            </button>
            <button
              type="button"
              onClick={() => setSalio(true)}
              style={{
                height: 52,
                background: "transparent",
                color: "rgba(249,241,233,.55)",
                border: "1px solid rgba(138,60,24,.6)",
                borderRadius: 3,
                fontFamily: "var(--font-title)",
                fontSize: 14.5,
                letterSpacing: ".16em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              Salir
            </button>
          </div>
        </>
      )}
    </div>
  );
}
