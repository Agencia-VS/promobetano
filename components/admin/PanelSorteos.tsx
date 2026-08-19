"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export type Sorteo = {
  id: number;
  nombre: string;
  estado: string;
  n_ganadores: number;
  n_suplentes: number;
  ventana_desde: string | null;
  ventana_hasta: string | null;
  creado_at: string;
  ejecutado_at: string | null;
  en_pool: number;
  ganadores_vigentes: number;
  suplentes_vigentes: number;
  reproduce: boolean | null;
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

  const ejecutar = (id: number, nombreSorteo: string) =>
    conManejo(async () => {
      // Confirmación explícita: el sorteo no se puede deshacer y esto se
      // acciona con la gente esperando el resultado.
      if (
        !window.confirm(
          `Ejecutar «${nombreSorteo}»?\n\nEl sorteo NO se puede deshacer ni repetir. Se congela el pool de participantes, se eligen los ganadores y se encolan sus correos.`,
        )
      ) {
        return;
      }
      const { resumen } = await pide(`/api/admin/sorteos/${id}`, {
        method: "POST",
      });
      setError(null);
      iniciarTransicion(() => router.refresh());
      window.alert(
        `Sorteo ejecutado.\n\nParticipantes en el pool: ${resumen?.en_pool}\nGanadores: ${resumen?.ganadores}\nSuplentes: ${resumen?.suplentes}`,
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

  return (
    <div className="tarjeta">
      <h2 className="tarjeta__titulo">Sorteos</h2>

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
          Todavía no hay sorteos. Crea uno en borrador; se ejecuta después, en
          un paso aparte.
        </p>
      ) : (
        <div className="tabla-caja">
          <table className="tabla">
            <thead>
              <tr>
                <th>Sorteo</th>
                <th>Estado</th>
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
                  <td>
                    <span className="pastilla">{s.estado}</span>
                  </td>
                  <td>{s.estado === "ejecutado" ? s.en_pool : "—"}</td>
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
                  <td>
                    {s.reproduce === null
                      ? "—"
                      : s.reproduce
                        ? "sí"
                        : "NO — revisar"}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {s.estado === "borrador" ? (
                      <button
                        type="button"
                        className="btn btn--chico btn--primario"
                        onClick={() => ejecutar(s.id, s.nombre)}
                        disabled={trabajando}
                      >
                        Ejecutar
                      </button>
                    ) : s.estado === "ejecutado" ? (
                      <button
                        type="button"
                        className="btn btn--chico"
                        onClick={() => verResultados(s.id)}
                        disabled={trabajando}
                      >
                        {abierto === s.id ? "Ocultar" : "Ver resultados"}
                      </button>
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
