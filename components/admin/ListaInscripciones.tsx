"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Las jornadas para el desplegable. Llegan resueltas desde el servidor. */
export type OpcionJornada = { id: number; nombre: string };

type Fila = {
  id: number;
  creado_at: string;
  nombre: string;
  email: string;
  telefono: string;
  documento: string;
  origen: string;
  elegible: boolean;
  email_estado: string;
  acepta_marketing: boolean;
  sorteo_id: number;
};

type Cursor = { at: string; id: number } | null;

const FORMATO = new Intl.DateTimeFormat("es-CL", {
  timeZone: "America/Santiago",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/**
 * Listado de inscripciones con paginación por cursor.
 *
 * "Cargar más" y no páginas numeradas: el cursor keyset no sabe cuántas páginas
 * hay ni puede saltar a la 40 sin recorrer, y ese es justamente el precio que
 * paga a cambio de que la página 4.000 cueste lo mismo que la primera. Con
 * 200.000 filas, la alternativa —OFFSET— hace que la última página tarde
 * cientos de veces más.
 *
 * El buscador tiene debounce porque cada tecla sería una consulta de trigramas
 * sobre la tabla completa.
 */
export function ListaInscripciones({
  jornadas = [],
}: {
  jornadas?: OpcionJornada[];
}) {
  const [filas, setFilas] = useState<Fila[]>([]);
  const [cursor, setCursor] = useState<Cursor>(null);
  const [hayMas, setHayMas] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [buscar, setBuscar] = useState("");
  const [soloElegibles, setSoloElegibles] = useState<string>("");
  const [jornada, setJornada] = useState<string>("");

  // Identifica la búsqueda vigente: una respuesta lenta de una búsqueda vieja
  // no debe pisar los resultados de la nueva.
  const peticion = useRef(0);

  const cargar = useCallback(
    async (
      desde: Cursor,
      acumular: boolean,
      termino: string,
      elegibles: string,
      cualJornada: string,
    ) => {
      const mia = ++peticion.current;
      setCargando(true);
      setError(null);

      const p = new URLSearchParams();
      if (termino.trim()) p.set("buscar", termino.trim());
      if (elegibles) p.set("elegibles", elegibles);
      if (cualJornada) p.set("jornada", cualJornada);
      if (desde) {
        p.set("cursor_at", desde.at);
        p.set("cursor_id", String(desde.id));
      }

      try {
        const r = await fetch(`/api/admin/inscripciones?${p}`);
        const cuerpo = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(cuerpo?.error ?? "No se pudo cargar.");
        if (mia !== peticion.current) return;

        setFilas((previas) =>
          acumular ? [...previas, ...cuerpo.filas] : cuerpo.filas,
        );
        setCursor(cuerpo.cursor);
        setHayMas(Boolean(cuerpo.hayMas));
      } catch (e) {
        if (mia !== peticion.current) return;
        setError(e instanceof Error ? e.message : "Error inesperado.");
      } finally {
        if (mia === peticion.current) setCargando(false);
      }
    },
    [],
  );

  useEffect(() => {
    const t = setTimeout(() => {
      void cargar(null, false, buscar, soloElegibles, jornada);
    }, 300);
    return () => clearTimeout(t);
  }, [buscar, soloElegibles, jornada, cargar]);

  /** Nombre corto de la jornada de una fila. El id crudo no le dice nada a nadie. */
  const nombreJornada = (id: number): string =>
    jornadas.find((j) => j.id === id)?.nombre.replace(/^Sorteo del /, "") ?? "—";

  return (
    <div className="tarjeta">
      <h2 className="tarjeta__titulo">Inscripciones</h2>

      <div className="fila-campos" style={{ marginBottom: 16 }}>
        <label className="campo" style={{ minWidth: 240 }}>
          <span>Buscar por nombre, correo o RUT</span>
          <input
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder="jose munoz"
            autoCapitalize="off"
            spellCheck={false}
          />
        </label>
        {/* Solo aparece si hay jornadas cargadas: en un proyecto recién montado
            un desplegable vacío no explica nada. */}
        {jornadas.length > 0 && (
          <label className="campo">
            <span>Jornada</span>
            <select
              value={jornada}
              onChange={(e) => setJornada(e.target.value)}
            >
              <option value="">Todas</option>
              {jornadas.map((j) => (
                <option key={j.id} value={String(j.id)}>
                  {j.nombre}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="campo">
          <span>Elegibilidad</span>
          <select
            value={soloElegibles}
            onChange={(e) => setSoloElegibles(e.target.value)}
          >
            <option value="">Todas</option>
            <option value="true">Solo elegibles</option>
            <option value="false">Solo dadas de baja</option>
          </select>
        </label>
      </div>

      {error && (
        <p role="alert" className="aviso aviso--error" style={{ marginBottom: 12 }}>
          {error}
        </p>
      )}

      <div className="tabla-caja">
        <table className="tabla">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Jornada</th>
              <th>Nombre</th>
              <th>Correo</th>
              <th>Teléfono</th>
              <th>RUT</th>
              <th>Panel</th>
              <th>Correo</th>
              <th>Mkt</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.id} style={{ opacity: f.elegible ? 1 : 0.45 }}>
                <td>{FORMATO.format(new Date(f.creado_at))}</td>
                {/* La fecha no dice la jornada: quien se inscribió el viernes a
                    las 22:00 entra al sorteo del sábado, y leer solo la hora
                    llevaría a contarlo en el día equivocado. */}
                <td className="tabla__tenue">{nombreJornada(f.sorteo_id)}</td>
                <td>{f.nombre}</td>
                <td>{f.email}</td>
                <td>+56 9 {f.telefono}</td>
                <td>{f.documento}</td>
                <td>{f.origen}</td>
                <td>
                  {f.email_estado === "rebote" || f.email_estado === "queja" ? (
                    <span className={`pastilla pastilla--${f.email_estado}`}>
                      {f.email_estado}
                    </span>
                  ) : (
                    f.email_estado
                  )}
                </td>
                <td>{f.acepta_marketing ? "sí" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filas.length === 0 && !cargando && (
        <p className="vacio">
          {buscar.trim()
            ? "Ningún resultado para esa búsqueda."
            : "Todavía no hay inscripciones."}
        </p>
      )}

      <div className="acciones">
        <button
          type="button"
          className="btn"
          onClick={() => void cargar(cursor, true, buscar, soloElegibles, jornada)}
          disabled={!hayMas || cargando}
        >
          {cargando ? "Cargando…" : hayMas ? "Cargar más" : "No hay más"}
        </button>
        <span className="estado__fuente" style={{ alignSelf: "center" }}>
          {filas.length} {filas.length === 1 ? "fila" : "filas"} a la vista
        </span>
      </div>
    </div>
  );
}
