"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { EstadoConcurso, FuenteEstado } from "@/lib/concurso";

const NOMBRE: Record<EstadoConcurso, string> = {
  abierto: "Inscripciones abiertas",
  cerrado: "Inscripciones cerradas",
  antes: "Todavía no abren",
  sin_configurar: "Sin configurar",
};

/**
 * Interruptor manual de inscripciones.
 *
 * Tres posiciones y no dos. "Seguir el calendario" no es lo mismo que "abrir":
 * después de una apertura de urgencia hay que poder devolver el control a las
 * fechas, y sin esa tercera posición el override queda pegado para siempre y
 * el cierre programado no ocurre nunca.
 */
export function InterruptorConcurso({
  estado,
  fuente,
  ventana,
}: {
  estado: EstadoConcurso;
  fuente: FuenteEstado;
  ventana: { inicio: string | null; cierre: string | null };
}) {
  const router = useRouter();
  const [pendiente, iniciarTransicion] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function accionar(abiertas: boolean | null) {
    if (enviando || pendiente) return;
    setError(null);
    setEnviando(true);
    try {
      const r = await fetch("/api/admin/concurso", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ abiertas }),
      });
      if (!r.ok) {
        const c = await r.json().catch(() => ({}));
        throw new Error(c?.error ?? "No se pudo cambiar el estado.");
      }
      // refresh() y no un setState local: el estado vigente lo calcula el
      // servidor combinando el interruptor con el calendario, así que pintar
      // aquí una suposición podría mostrar algo distinto de lo que ve el
      // público.
      iniciarTransicion(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    }
    setEnviando(false);
  }

  const ocupado = enviando || pendiente;

  return (
    <div className="tarjeta">
      <h2 className="tarjeta__titulo">Estado de inscripciones</h2>

      <div className={`estado estado--${estado}`}>
        <span className="estado__punto" aria-hidden />
        <span className="estado__texto">{NOMBRE[estado]}</span>
      </div>

      <p className="estado__fuente">
        {fuente === "manual"
          ? "Fijado a mano desde este panel. El calendario está en pausa."
          : "Siguiendo el calendario de las variables de entorno."}
      </p>

      <p className="estado__fuente" style={{ marginTop: 8 }}>
        {ventana.inicio && ventana.cierre ? (
          <>
            Calendario: del {ventana.inicio} al {ventana.cierre}.
          </>
        ) : (
          <>
            Calendario sin cargar: faltan <code>CONCURSO_INICIO</code> y{" "}
            <code>CONCURSO_CIERRE</code> en Vercel. Mientras no estén, la única
            forma de abrir es este interruptor.
          </>
        )}
      </p>

      <div className="acciones">
        <button
          type="button"
          className={`btn ${estado === "abierto" && fuente === "manual" ? "btn--activo" : "btn--primario"}`}
          onClick={() => accionar(true)}
          disabled={ocupado}
        >
          Abrir ahora
        </button>
        <button
          type="button"
          className={`btn btn--peligro ${estado === "cerrado" && fuente === "manual" ? "btn--activo" : ""}`}
          onClick={() => accionar(false)}
          disabled={ocupado}
        >
          Cerrar ahora
        </button>
        <button
          type="button"
          className={`btn ${fuente === "calendario" ? "btn--activo" : ""}`}
          onClick={() => accionar(null)}
          disabled={ocupado}
        >
          Seguir calendario
        </button>
      </div>

      {error && (
        <p role="alert" className="aviso aviso--error" style={{ marginTop: 12 }}>
          {error}
        </p>
      )}
    </div>
  );
}
