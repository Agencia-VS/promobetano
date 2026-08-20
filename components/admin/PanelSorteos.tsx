"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export type Sorteo = {
  id: number;
  /** Clave de la jornada («jornada-1»); null en los sorteos ad-hoc. */
  clave: string | null;
  nombre: string;
  estado: string;
  /** 'jornada' saca el pool de inscripciones.sorteo_id; 'ventana', del creado_at. */
  criterio: string;
  excluir_premiados: boolean;
  ventana_desde: string | null;
  ventana_hasta: string | null;
  n_ganadores: number;
  n_suplentes: number;
  creado_at: string;
  ejecutado_at: string | null;
  /** Cuánta gente lleva la jornada. Es la cifra que se mira antes de las 21:00. */
  inscritos: number;
  en_pool: number;
  excluidos: number;
  ganadores_vigentes: number;
  suplentes_vigentes: number;
  reproduce: boolean | null;
  membresia_completa: boolean | null;
};

type Resultado = {
  id: number;
  posicion: number;
  rol: string;
  nombre: string;
  email: string;
  telefono: string;
  documento: string;
  email_estado: string;
  motivo: string | null;
  promovido_desde: number | null;
  cambiado_at: string | null;
};

/*
 * Las ventanas se muestran SIEMPRE en hora de Chile, aunque el navegador del
 * equipo esté en otro huso: la jornada del viernes cierra a las 21:00 de
 * Santiago, y verlo como "01:00 del sábado" haría creer que el sorteo se corrió.
 */
const RELOJ = new Intl.DateTimeFormat("es-CL", {
  timeZone: "America/Santiago",
  weekday: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function ventana(desde: string | null, hasta: string | null): string {
  if (!desde || !hasta) return "todo el concurso";
  return `${RELOJ.format(new Date(desde))} → ${RELOJ.format(new Date(hasta))}`;
}

/**
 * Sorteos: crear, ejecutar y gestionar la cascada de suplentes.
 *
 * Crear y ejecutar son dos pasos separados a propósito. El sorteo es
 * irreversible —una vez ejecutado la RPC no deja repetirlo— así que revisar los
 * parámetros y disparar el azar no pueden ser el mismo clic.
 */
export function PanelSorteos({ sorteos }: { sorteos: Sorteo[] }) {
  const router = useRouter();
  const [pendiente, iniciarTransicion] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [abierto, setAbierto] = useState<number | null>(null);
  const [resultados, setResultados] = useState<Resultado[]>([]);

  const [nombre, setNombre] = useState("");
  const [nGanadores, setNGanadores] = useState("1");
  const [nSuplentes, setNSuplentes] = useState("3");

  async function pide(url: string, init?: RequestInit) {
    const r = await fetch(url, init);
    const cuerpo = await r.json().catch(() => ({}));
    if (!r.ok) {
      throw new Error(cuerpo?.detalle || cuerpo?.error || "Falló la operación.");
    }
    return cuerpo;
  }

  async function conManejo(accion: () => Promise<void>) {
    if (ocupado || pendiente) return;
    setError(null);
    setOcupado(true);
    try {
      await accion();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    }
    setOcupado(false);
  }

  const crear = (ev: React.FormEvent) => {
    ev.preventDefault();
    return conManejo(async () => {
      await pide("/api/admin/sorteos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nombre,
          n_ganadores: Number(nGanadores),
          n_suplentes: Number(nSuplentes),
        }),
      });
      setNombre("");
      iniciarTransicion(() => router.refresh());
    });
  };

  /**
   * Trae las jornadas del calendario a la base. No manda fechas: el servidor las
   * saca de lib/concurso.ts, que es la única fuente. Idempotente.
   */
  const sincronizar = () =>
    conManejo(async () => {
      const { jornadas, problemas } = await pide("/api/admin/jornadas", {
        method: "POST",
      });
      iniciarTransicion(() => router.refresh());
      const resumen = (jornadas as Array<{ clave: string; accion: string }>)
        .map((j) => `${j.clave}: ${j.accion}`)
        .join("\n");
      const avisos = (problemas as string[]) ?? [];
      window.alert(
        `Jornadas sincronizadas con el calendario.\n\n${resumen}` +
          (avisos.length ? `\n\nRevisa:\n· ${avisos.join("\n· ")}` : ""),
      );
    });

  const ejecutar = (s: Sorteo) =>
    conManejo(async () => {
      // Confirmación explícita: el sorteo no se puede deshacer y esto se
      // acciona con la gente esperando el resultado.
      if (
        !window.confirm(
          `Ejecutar «${s.nombre}»?\n\nEl sorteo NO se puede deshacer ni repetir. Se congela el pool de participantes y se eligen los ganadores.\n\nLos correos de ganador NO salen solos: se encolan aparte, con el botón «Correos a ganadores» de esta misma fila.`,
        )
      ) {
        return;
      }

      /*
       * Con la ventana todavía abierta la RPC se niega, y hace bien: quien se
       * inscribió a las 20:58 está en plazo y las bases lo admiten. Forzar existe
       * para el corte de urgencia, así que se pide un segundo consentimiento
       * aparte y queda registrado en la auditoría como forzado.
       */
      let forzar = false;
      const abierta = s.ventana_hasta !== null && new Date(s.ventana_hasta) > new Date();
      if (abierta) {
        if (
          !window.confirm(
            `La ventana de «${s.nombre}» cierra el ${ventana(s.ventana_desde, s.ventana_hasta).split(" → ")[1]} y todavía no llega.\n\nSi sorteas ahora, quien se inscriba en lo que queda NO entra a ningún sorteo. Se registrará como sorteo forzado.\n\n¿Forzar de todas formas?`,
          )
        ) {
          return;
        }
        forzar = true;
      }

      const { resumen } = await pide(`/api/admin/sorteos/${s.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ forzar }),
      });
      setError(null);
      iniciarTransicion(() => router.refresh());
      window.alert(
        `Sorteo ejecutado.\n\nParticipantes en el pool: ${resumen?.en_pool}\nExcluidos: ${resumen?.excluidos}\nGanadores: ${resumen?.ganadores}\nSuplentes: ${resumen?.suplentes}`,
      );
    });

  const verResultados = (id: number) =>
    conManejo(async () => {
      if (abierto === id) {
        setAbierto(null);
        setResultados([]);
        return;
      }
      const { resultados: r } = await pide(`/api/admin/sorteos/${id}`);
      setResultados(r as Resultado[]);
      setAbierto(id);
    });

  /*
   * El batch de correos de ganador. Manual a propósito: el equipo decide cuándo
   * se avisa, jornada por jornada. La RPC encola y el cron envía; la única
   * red contra el doble clic es la restricción única de la cola, que omite a
   * quien ya tiene su correo — así que tras una promoción se vuelve a apretar
   * sin miedo: entra solo el promovido nuevo.
   */
  const correosGanadores = (s: Sorteo) =>
    conManejo(async () => {
      if (
        !window.confirm(
          `Encolar los correos de ganador de «${s.nombre}»?\n\nVan para los ganadores vigentes y los suplentes promovidos. Quien ya lo recibió NO se repite. El cron los envía dentro del minuto siguiente.`,
        )
      ) {
        return;
      }
      const { encolados } = await pide(`/api/admin/sorteos/${s.id}/correos`, {
        method: "POST",
      });
      window.alert(
        `Listo: ${encolados} correo(s) encolado(s). El cron los envía dentro del minuto siguiente.`,
      );
    });

  const promover = (resultadoId: number, quien: string) =>
    conManejo(async () => {
      const motivo = window.prompt(
        `Motivo por el que ${quien} no recibe el premio (queda en la auditoría):`,
        "No respondió en el plazo",
      );
      if (motivo === null) return;
      await pide("/api/admin/suplentes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resultado_id: resultadoId, motivo }),
      });
      const { resultados: r } = await pide(`/api/admin/sorteos/${abierto}`);
      setResultados(r as Resultado[]);
      iniciarTransicion(() => router.refresh());
    });

  const trabajando = ocupado || pendiente;

  const jornadasCargadas = sorteos.filter((s) => s.criterio === "jornada").length;

  return (
    <div className="tarjeta">
      <div className="tarjeta__cabecera">
        <h2 className="tarjeta__titulo">Sorteos</h2>
        <button
          type="button"
          className="btn btn--chico"
          onClick={sincronizar}
          disabled={trabajando}
        >
          {jornadasCargadas === 0
            ? "Cargar jornadas del calendario"
            : "Sincronizar jornadas"}
        </button>
      </div>

      <form onSubmit={crear} className="fila-campos" style={{ marginBottom: 18 }}>
        <label className="campo">
          <span>Nombre</span>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Sorteo final"
            required
          />
        </label>
        <label className="campo">
          <span>Ganadores</span>
          <input
            type="number"
            min="1"
            value={nGanadores}
            onChange={(e) => setNGanadores(e.target.value)}
            required
          />
        </label>
        <label className="campo">
          <span>Suplentes</span>
          <input
            type="number"
            min="0"
            value={nSuplentes}
            onChange={(e) => setNSuplentes(e.target.value)}
            required
          />
        </label>
        <button type="submit" className="btn" disabled={trabajando}>
          Crear borrador
        </button>
      </form>

      {error && (
        <p role="alert" className="aviso aviso--error" style={{ marginBottom: 12 }}>
          {error}
        </p>
      )}

      {sorteos.length === 0 ? (
        <p className="vacio">
          Todavía no hay sorteos. Aprieta «Cargar jornadas del calendario» para
          crear los tres sorteos diarios en borrador; cada uno se ejecuta después,
          en un paso aparte.
        </p>
      ) : (
        <div className="tabla-caja">
          <table className="tabla">
            <thead>
              <tr>
                <th>Sorteo</th>
                <th>Ventana</th>
                <th>Estado</th>
                <th>Inscritos</th>
                <th>Pool</th>
                <th>Ganadores</th>
                <th>Suplentes</th>
                <th>Reproduce</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sorteos.map((s) => (
                <tr key={s.id}>
                  <td>{s.nombre}</td>
                  {/* La ventana no se mostraba en ninguna parte, aunque es lo que
                      decide quién entra a cada sorteo. */}
                  <td className="tabla__tenue">
                    {ventana(s.ventana_desde, s.ventana_hasta)}
                  </td>
                  <td>
                    <span className="pastilla">{s.estado}</span>
                  </td>
                  <td>{s.criterio === "jornada" ? s.inscritos : "—"}</td>
                  <td>
                    {s.estado === "ejecutado"
                      ? s.excluidos > 0
                        ? `${s.en_pool} (${s.excluidos} fuera)`
                        : s.en_pool
                      : "—"}
                  </td>
                  <td>
                    {s.estado === "ejecutado"
                      ? `${s.ganadores_vigentes} / ${s.n_ganadores}`
                      : s.n_ganadores}
                  </td>
                  <td>
                    {s.estado === "ejecutado"
                      ? `${s.suplentes_vigentes} / ${s.n_suplentes}`
                      : s.n_suplentes}
                  </td>
                  {/* Dos garantías distintas y las dos importan: `reproduce` dice
                      que el ORDEN sale de la semilla, `membresia_completa` que no
                      quedó nadie del ámbito sin pool ni motivo de exclusión. */}
                  <td>
                    {s.reproduce === null
                      ? "—"
                      : s.reproduce && s.membresia_completa !== false
                        ? "sí"
                        : "NO — revisar"}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {s.estado === "borrador" ? (
                      <button
                        type="button"
                        className="btn btn--chico btn--primario"
                        onClick={() => ejecutar(s)}
                        disabled={trabajando}
                      >
                        Ejecutar
                      </button>
                    ) : s.estado === "ejecutado" ? (
                      <span
                        style={{
                          display: "inline-flex",
                          gap: 8,
                          justifyContent: "flex-end",
                        }}
                      >
                        <button
                          type="button"
                          className="btn btn--chico"
                          onClick={() => verResultados(s.id)}
                          disabled={trabajando}
                        >
                          {abierto === s.id ? "Ocultar" : "Ver resultados"}
                        </button>
                        <button
                          type="button"
                          className="btn btn--chico btn--primario"
                          onClick={() => correosGanadores(s)}
                          disabled={trabajando}
                        >
                          Correos a ganadores
                        </button>
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {abierto !== null && resultados.length > 0 && (
        <div className="tabla-caja" style={{ marginTop: 18 }}>
          <table className="tabla">
            <thead>
              <tr>
                <th>#</th>
                <th>Rol</th>
                <th>Nombre</th>
                <th>Correo</th>
                <th>Teléfono</th>
                <th>RUT</th>
                <th>Motivo</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {resultados.map((r) => (
                <tr key={r.id}>
                  <td>{r.posicion}</td>
                  <td>
                    <span className={`pastilla pastilla--${r.rol}`}>
                      {r.rol}
                    </span>
                  </td>
                  <td>{r.nombre}</td>
                  <td>
                    {r.email}
                    {r.email_estado === "rebote" || r.email_estado === "queja" ? (
                      <>
                        {" "}
                        <span className={`pastilla pastilla--${r.email_estado}`}>
                          {r.email_estado}
                        </span>
                      </>
                    ) : null}
                  </td>
                  <td>+56 9 {r.telefono}</td>
                  <td>{r.documento}</td>
                  <td>{r.motivo ?? "—"}</td>
                  <td style={{ textAlign: "right" }}>
                    {r.rol === "ganador" ? (
                      <button
                        type="button"
                        className="btn btn--chico btn--peligro"
                        onClick={() => promover(r.id, r.nombre)}
                        disabled={trabajando}
                      >
                        Declina
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
