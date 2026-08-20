"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { Confirmado } from "@/lib/confirmado";
import "@/styles/ruleta.css";

const DURACION_MS = 2800;
const SEGMENTOS = Array.from({ length: 6 }, (_, i) => i);

/**
 * La animación representa una decisión que YA tomó PostgreSQL. Nunca calcula
 * el resultado: retrasar el premio en el navegador no puede alterar stock,
 * folio ni correo, y recargar conserva exactamente la misma respuesta.
 */
export function ResultadoRuleta({
  resultado,
  compacto = false,
}: {
  resultado: Confirmado;
  compacto?: boolean;
}) {
  const [girando, setGirando] = useState(true);
  const [grados, setGrados] = useState(0);

  useEffect(() => {
    const reducido = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const bytes = new Uint32Array(1);
    crypto.getRandomValues(bytes);
    const vueltas = 6 + (bytes[0] % 4);
    // Se detiene en el centro de uno de los seis gajos visibles. El resultado
    // ya viene de la base; este índice solo gobierna la animación cosmética.
    const angulo = (bytes[0] % 6) * 60;

    const frame = requestAnimationFrame(() => {
      setGrados(vueltas * 360 + angulo);
    });
    const timer = window.setTimeout(
      () => setGirando(false),
      reducido ? 350 : DURACION_MS,
    );

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, []);

  if (girando) {
    return (
      <section
        className={`ruleta ${compacto ? "ruleta--compacta" : ""}`}
        aria-live="polite"
        aria-busy="true"
      >
        <div>
          <span className="ruleta__antetitulo">Sorteo instantáneo</span>
          <h1 className="ruleta__titulo">Girando la ruleta…</h1>
          <p className="ruleta__texto">Tu resultado se está revelando.</p>
        </div>

        <div className="ruleta__marco" aria-hidden="true">
          <span className="ruleta__puntero" />
          <div
            className="ruleta__disco"
            style={{ "--giro-ruleta": `${grados}deg` } as CSSProperties}
          >
            {SEGMENTOS.map((segmento) => (
              <span
                className="ruleta__segmento"
                data-segmento={segmento}
                key={segmento}
              >
                <BotellaRuleta />
              </span>
            ))}
            <span className="ruleta__centro">EDC</span>
          </div>
        </div>
      </section>
    );
  }

  if (resultado.ganador) {
    return (
      <section
        className={`ruleta ruleta--resultado ruleta--ganador ${compacto ? "ruleta--compacta" : ""}`}
        aria-live="assertive"
        aria-busy="false"
      >
        <span className="ruleta__icono" aria-hidden="true">
          ✓
        </span>
        <div>
          <span className="ruleta__antetitulo">Resultado confirmado</span>
          <h1 className="ruleta__titulo">¡Ganaste!</h1>
          <p className="ruleta__texto ruleta__texto--fuerte">
            Acércate ahora a la mesa de premiación y muestra esta pantalla.
          </p>
        </div>

        <div className="ruleta__folio">
          <span>{resultado.pruebas ? "Número de prueba" : "Número de ganador"}</span>
          <strong>
            {resultado.pruebas
              ? resultado.numeroGanador
                ? `PRUEBA ${resultado.numeroGanador}`
                : "PRUEBA"
              : resultado.numeroGanador
                ? `#${String(resultado.numeroGanador).padStart(3, "0")}`
                : "REVISAR"}
          </strong>
        </div>

        {resultado.pruebas ? (
          <p className="ruleta__aviso-prueba">
            Ensayo: no descuenta stock ni permite retirar un premio. Enviaremos
            el respaldo de prueba a <strong>{resultado.email}</strong>.
          </p>
        ) : (
          <p className="ruleta__texto">
            También enviamos un respaldo a <strong>{resultado.email}</strong>.
          </p>
        )}
      </section>
    );
  }

  return (
    <section
      className={`ruleta ruleta--resultado ${compacto ? "ruleta--compacta" : ""}`}
      aria-live="polite"
      aria-busy="false"
    >
      <span className="ruleta__icono ruleta__icono--neutro" aria-hidden="true">
        ·
      </span>
      <div>
        <span className="ruleta__antetitulo">Resultado confirmado</span>
        <h1 className="ruleta__titulo">Esta vez no ganaste</h1>
        <p className="ruleta__texto ruleta__texto--fuerte">
          Gracias por participar. Puedes volver a intentarlo mañana.
        </p>
      </div>

      {resultado.pruebas && (
        <p className="ruleta__aviso-prueba">
          Ensayo: esta inscripción no participa del stock real.
        </p>
      )}
    </section>
  );
}

/** Silueta vectorial liviana del perfume, repetida en los seis gajos. */
function BotellaRuleta() {
  return (
    <svg viewBox="0 0 34 48" aria-hidden="true" focusable="false">
      <path d="M13 2h8v6l4 3v4H9v-4l4-3V2Z" fill="currentColor" />
      <rect x="5" y="14" width="24" height="30" rx="4" fill="currentColor" />
      <rect
        x="9"
        y="21"
        width="16"
        height="13"
        rx="1.5"
        fill="none"
        stroke="var(--color-ink)"
        strokeWidth="1.4"
      />
      <path
        d="M12 26h10M12 29h10"
        stroke="var(--color-ink)"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
