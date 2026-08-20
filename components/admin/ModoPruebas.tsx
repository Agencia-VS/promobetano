"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export type IdentidadPrueba = { clase: string; valor: string; nota: string | null };

type Purga = {
  inscripciones: number;
  correos: number;
  resultados: number;
  pool: number;
  excluidos: number;
  auditoria: number;
  sorteos: number;
  conservadas: number;
};

/**
 * Ensayo en producción: abrirlo, cerrarlo y borrar lo que dejó.
 *
 * Es una tarjeta aparte del interruptor de inscripciones, aunque las dos
 * «abran», porque lo que hacen es distinto y confundirlas sale caro. El
 * interruptor abre el concurso DE VERDAD: lo que entre consume stock, usa el
 * correlativo 1..90 y se conserva. Esto abre una ventana de ensayo que ejecuta
 * la misma lógica por bloques N, pero con stock y correlativos PRUEBA separados;
 * se avisa en el formulario y se borra entera después.
 *
 * Fuera de la ventana del concurso, además, el interruptor por sí solo no
 * alcanza: ninguna jornada cubre el instante y la base rechaza cada alta. Esa
 * jornada la crea este botón.
 */
export function ModoPruebas({
  activo,
  recibiendoAltas,
  identidades,
  filasDePrueba,
  sorteosDePrueba,
}: {
  /** El interruptor de ensayo, tal como está en la base. */
  activo: boolean;
  /**
   * Si un alta de AHORA sería de ensayo. Difiere de `activo` cuando el modo
   * quedó encendido y ya arrancó una jornada real: la ventana de ensayo termina
   * donde empieza la de verdad, así que las altas volvieron a ser reales sin que
   * nadie apretara nada.
   */
  recibiendoAltas: boolean;
  identidades: IdentidadPrueba[];
  /** Cuántas inscripciones de prueba hay ahora mismo. Es lo que se va a borrar. */
  filasDePrueba: number;
  /**
   * Cuántas jornadas de ensayo quedan en `sorteos`.
   *
   * Va aparte de `filasDePrueba` porque las dos cosas se borran juntas pero
   * desaparecen por separado, y contar solo las inscripciones producía un
   * bloqueo sin salida: si alguien borra las filas a mano desde Supabase, el
   * contador queda en cero y este botón se deshabilita, pero la jornada de
   * ensayo sigue ahí en estado 'ejecutado' y `abrir_pruebas` se niega a abrir
   * mientras exista. Sin esta cifra no quedaba ninguna acción posible en el
   * panel: ni limpiar ni volver a abrir.
   */
  sorteosDePrueba: number;
}) {
  const router = useRouter();
  const [pendiente, iniciarTransicion] = useTransition();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ocupado = enviando || pendiente;

  /* Hay algo que limpiar si queda CUALQUIERA de las dos cosas. La jornada de
     ensayo sola también cuenta: es la que impide abrir el siguiente. */
  const hayQuePurgar = filasDePrueba > 0 || sorteosDePrueba > 0;

  async function pide(url: string): Promise<Record<string, unknown>> {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" } });
    const cuerpo = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(String(cuerpo?.detalle || cuerpo?.error || "Falló la operación."));
    return cuerpo;
  }

  async function conManejo(accion: () => Promise<void>) {
    if (ocupado) return;
    setError(null);
    setEnviando(true);
    try {
      await accion();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    }
    setEnviando(false);
  }

  const cambiar = (abrir: boolean) =>
    conManejo(async () => {
      const r = await fetch("/api/admin/pruebas/modo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ abrir }),
      });
      const cuerpo = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(String(cuerpo?.detalle || cuerpo?.error || "No se pudo cambiar el modo."));
      }
      // refresh() y no un estado local: quién está abierto lo decide el servidor
      // combinando el interruptor con el calendario, y pintar acá una suposición
      // podría mostrar algo distinto de lo que ve el público.
      iniciarTransicion(() => router.refresh());
    });

  const purgar = () =>
    conManejo(async () => {
      /*
       * Confirmación explícita y con la cifra dentro: es la única acción del
       * panel que borra inscripciones, y no se deshace. La cifra importa porque
       * un cero también es una respuesta —no hay nada que limpiar— y porque un
       * número más alto del esperado es la señal de que el modo quedó encendido
       * más tiempo del que alguien cree.
       */
      if (
        !window.confirm(
          `Borrar ${filasDePrueba} inscripción(es) de prueba y ${sorteosDePrueba} jornada(s) de ensayo?\n\nNo se puede deshacer. No toca ninguna inscripción real: solo las marcadas como prueba, y nunca las que quedaron dentro de un sorteo ya ejecutado.`,
        )
      ) {
        return;
      }

      const { resumen } = (await pide("/api/admin/pruebas/datos")) as {
        resumen: Purga | null;
      };
      iniciarTransicion(() => router.refresh());
      window.alert(
        resumen
          ? [
              "Limpieza terminada.",
              "",
              `Inscripciones borradas: ${resumen.inscripciones}`,
              `Correos en cola: ${resumen.correos}`,
              `Resultados: ${resumen.resultados}`,
              `Pool: ${resumen.pool}`,
              `Excluidos: ${resumen.excluidos}`,
              `Auditoría: ${resumen.auditoria}`,
              `Sorteos de prueba: ${resumen.sorteos}`,
              // Se dice siempre que las haya, aunque «conservadas» suene a
              // fallo: son filas que quedaron dentro de un sorteo real ya
              // ejecutado, y callarlas dejaría al equipo apretando el botón una
              // y otra vez sin entender por qué la cifra no baja a cero.
              ...(resumen.conservadas > 0
                ? [
                    "",
                    `Se conservaron ${resumen.conservadas}: quedaron dentro de un sorteo real ya ejecutado, cuyo pool está congelado para poder auditarlo. Están fuera de ese sorteo con motivo «prueba», así que no afectan el resultado.`,
                  ]
                : []),
            ].join("\n")
          : "Limpieza terminada.",
      );
    });

  const ruts = identidades.filter((i) => i.clase === "rut");
  const correos = identidades.filter((i) => i.clase === "email");

  return (
    <div className="tarjeta">
      <h2 className="tarjeta__titulo">Pruebas en producción</h2>

      <div className={`estado estado--${activo ? "abierto" : "cerrado"}`}>
        <span className="estado__punto" aria-hidden />
        <span className="estado__texto">
          {activo ? "Ensayo en curso" : "Sin ensayo"}
        </span>
      </div>

      <p className="estado__fuente">
        {activo
          ? "El formulario está ensayando la ruleta con la configuración de pruebas de Ruleta. Usa bloques, números PRUEBA y correos aislados; no consume premios reales. Ciérralo antes de que abra el concurso."
          : "Abre una jornada aislada que recorre la ruleta con la configuración de pruebas. Sus ganadores reciben PRUEBA 1, PRUEBA 2… y correo de respaldo, sin tocar el stock 1–90."}
      </p>

      {activo && !recibiendoAltas && (
        <p className="aviso aviso--error" style={{ marginTop: 10 }}>
          <strong>El ensayo quedó encendido y ya hay una jornada real
          corriendo.</strong>{" "}
          Las altas de ahora son de verdad —la ventana de ensayo terminó donde
          empezó la real, así que nadie quedó en la de mentira— pero el
          interruptor sigue fijado a mano. Ciérralo para devolverle el control al
          calendario.
        </p>
      )}

      <p className="estado__fuente" style={{ marginTop: 8 }}>
        Sin límite de inscripciones para{" "}
        {ruts.map((r) => <code key={r.valor}>{formateaRut(r.valor)}</code>)}
        {ruts.length > 0 && correos.length > 0 ? " y " : null}
        {correos.map((c) => <code key={c.valor}>{c.valor}</code>)}. El resto de
        los RUT sigue con una inscripción por jornada, así que el mensaje de «ya
        estás inscrito» también se puede probar.
      </p>

      <p className="estado__fuente" style={{ marginTop: 8 }}>
        El resultado no es 50/50: hay una posición ganadora aleatoria dentro de
        cada bloque de N. Si cambias el N de pruebas en el panel de Ruleta, el
        valor nuevo comienza en el siguiente bloque completo. El correo del
        ganador sale por la misma cola y cron de producción, rotulado como prueba.
      </p>

      <p className="estado__fuente" style={{ marginTop: 8 }}>
        Datos de prueba en la base ahora:{" "}
        <strong>{filasDePrueba.toLocaleString("es-CL")}</strong> inscripción(es)
        y <strong>{sorteosDePrueba}</strong> jornada(s) de ensayo. Mientras quede
        una jornada, no se puede abrir la siguiente.
      </p>

      <div className="acciones">
        <button
          type="button"
          className={`btn ${activo ? "btn--activo" : "btn--primario"}`}
          onClick={() => cambiar(true)}
          disabled={ocupado || activo}
        >
          Abrir pruebas
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => cambiar(false)}
          disabled={ocupado || !activo}
        >
          Cerrar pruebas
        </button>
        <button
          type="button"
          className="btn btn--peligro"
          onClick={purgar}
          disabled={ocupado || !hayQuePurgar}
        >
          Borrar datos de prueba
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

/**
 * El RUT se guarda normalizado —sin puntos ni guión— porque así se compara. Se
 * muestra con su forma de siempre: es el dato que alguien va a teclear en el
 * formulario, y copiarlo de acá tiene que dar lo mismo que escribirlo.
 */
function formateaRut(norm: string): string {
  const cuerpo = norm.slice(0, -1);
  const dv = norm.slice(-1);
  return `${cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${dv}`;
}
