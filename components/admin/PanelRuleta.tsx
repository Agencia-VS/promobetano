"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export type JornadaRuleta = {
  sorteo_id: number | null;
  clave: string | null;
  nombre: string;
  ventana_desde: string;
  ventana_hasta: string;
  abierta: boolean;
  modo: "automatico" | "manual";
  n_inicial: number;
  n_manual: number | null;
  n_actual: number;
  n_siguiente: number;
  bloque_numero: number | null;
  bloque_posicion: number | null;
  bloque_tamano: number | null;
  inscritos: number;
  ganadores: number;
  limite_diario: number;
  ganadores_total: number;
  limite_total: number;
};

export type GanadorRuleta = {
  numero_ganador: number;
  creado_at: string;
  jornada: string;
  nombre: string;
  email: string;
  documento: string;
};

export function PanelRuleta({
  jornadas,
  ganadores,
  pruebas,
  pruebasNoDisponibles,
}: {
  jornadas: JornadaRuleta[];
  ganadores: GanadorRuleta[];
  pruebas: JornadaRuleta | null;
  pruebasNoDisponibles: boolean;
}) {
  const router = useRouter();
  const global = jornadas[0];
  const asignados = useMemo(
    () => new Map(ganadores.map((g) => [g.numero_ganador, g])),
    [ganadores],
  );

  if (!global) {
    return (
      <p className="aviso aviso--error">
        No hay jornadas instantáneas configuradas. Sincroniza las jornadas en
        Resumen y aplica nuevamente la migración del hotfix.
      </p>
    );
  }

  return (
    <>
      <section className="tarjeta no-imprimir">
        <div className="tarjeta__cabecera">
          <h2 className="tarjeta__titulo">Stock global</h2>
          <button
            type="button"
            className="btn btn--chico"
            onClick={() => router.refresh()}
          >
            Actualizar
          </button>
        </div>
        <div className="cifras">
          <Cifra valor={global.ganadores_total} nombre="Asignados" />
          <Cifra
            valor={global.limite_total - global.ganadores_total}
            nombre="Disponibles"
          />
          <Cifra valor={global.limite_total} nombre="Tope evento" />
        </div>
      </section>

      <section className="no-imprimir" style={{ marginTop: 28 }}>
        <div style={{ marginBottom: 12 }}>
          <h2 className="tarjeta__titulo">Configuración de pruebas</h2>
          <p className="adm__bajada">
            Es el espejo aislado de la operación real: su tendencia, bloques,
            ganadores y N no consumen ni modifican el stock 1–90.
          </p>
        </div>

        {pruebas ? (
          <div className="adm__rejilla">
            <EditorJornada jornada={pruebas} esPrueba />
          </div>
        ) : (
          <p className="aviso aviso--error">
            {pruebasNoDisponibles
              ? "El panel de pruebas aún no está disponible. Aplica la última migración de la ruleta y recarga."
              : "No se encontró la configuración de pruebas."}
          </p>
        )}
      </section>

      <div className="no-imprimir" style={{ marginTop: 28, marginBottom: 12 }}>
        <h2 className="tarjeta__titulo">Configuración real</h2>
        <p className="adm__bajada">
          Estas jornadas sí asignan stock y números de ganador correlativos.
        </p>
      </div>

      <div className="adm__rejilla no-imprimir">
        {jornadas.map((jornada) => (
          <EditorJornada key={jornada.sorteo_id} jornada={jornada} />
        ))}
      </div>

      <section className="tarjeta lista-impresion">
        <div className="tarjeta__cabecera">
          <div>
            <h2 className="tarjeta__titulo">Control manual 1–90</h2>
            <p className="adm__bajada">
              La casilla “Entregado” se marca únicamente en papel.
            </p>
          </div>
          <button
            type="button"
            className="btn btn--primario no-imprimir"
            onClick={() => window.print()}
          >
            Imprimir lista
          </button>
        </div>

        <div className="tabla-caja">
          <table className="tabla tabla--ganadores">
            <thead>
              <tr>
                <th>N.º</th>
                <th>Ganador</th>
                <th>RUT</th>
                <th>Correo</th>
                <th>Jornada</th>
                <th>Entregado</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 90 }, (_, i) => i + 1).map((numero) => {
                const g = asignados.get(numero);
                return (
                  <tr key={numero}>
                    <td>
                      <strong>#{String(numero).padStart(3, "0")}</strong>
                    </td>
                    <td>{g?.nombre ?? ""}</td>
                    <td>{g?.documento ?? ""}</td>
                    <td>{g?.email ?? ""}</td>
                    <td>{g?.jornada ?? ""}</td>
                    <td>
                      <span className="casilla-papel" aria-label="Sin marcar" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function EditorJornada({
  jornada,
  esPrueba = false,
}: {
  jornada: JornadaRuleta;
  esPrueba?: boolean;
}) {
  const router = useRouter();
  const [modo, setModo] = useState(jornada.modo);
  const [n, setN] = useState(
    String(jornada.modo === "manual" ? jornada.n_manual : jornada.n_inicial),
  );
  const [desde, setDesde] = useState(aFechaLocal(jornada.ventana_desde));
  const [hasta, setHasta] = useState(aFechaLocal(jornada.ventana_hasta));
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function guardar(ev: React.FormEvent) {
    ev.preventDefault();
    if (guardando) return;
    setGuardando(true);
    setMensaje(null);

    try {
      const respuesta = await fetch(
        esPrueba ? "/api/admin/ruleta/pruebas" : "/api/admin/ruleta",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...(esPrueba ? {} : { sorteo_id: jornada.sorteo_id }),
            modo,
            n: Number(n),
            ventana_desde: desde,
            ventana_hasta: hasta,
          }),
        },
      );
      const cuerpo = await respuesta.json().catch(() => ({}));
      if (!respuesta.ok) {
        throw new Error(
          cuerpo?.detalle ?? "No se pudo guardar. Revisa fechas y solapes.",
        );
      }
      setMensaje(
        "Guardado. El N nuevo se usará al abrir el siguiente bloque completo.",
      );
      router.refresh();
    } catch (e) {
      setMensaje(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form className="tarjeta" onSubmit={guardar}>
      <div className="tarjeta__cabecera">
        <h2 className="tarjeta__titulo">{jornada.nombre}</h2>
        <span
          className={`pastilla ${jornada.abierta ? "pastilla--ganador" : "pastilla--suplente"}`}
        >
          {jornada.abierta
            ? esPrueba
              ? "En ventana simulada"
              : "Abierta"
            : "Fuera de horario"}
        </span>
      </div>

      <div className="cifras ruleta-admin__cifras">
        <Cifra valor={jornada.inscritos} nombre="Inscritos" />
        <Cifra
          valor={`${jornada.ganadores}/${jornada.limite_diario}`}
          nombre="Ganadores"
        />
        <Cifra valor={jornada.n_actual} nombre="N bloque actual" />
        <Cifra valor={jornada.n_siguiente} nombre="N siguiente" />
      </div>

      <p className="adm__bajada ruleta-admin__bloque">
        {jornada.bloque_numero === null
          ? "Aún no se abrió el primer bloque."
          : `Bloque ${jornada.bloque_numero}: ${jornada.bloque_posicion}/${jornada.bloque_tamano} posiciones procesadas.`}
      </p>

      <div className="fila-campos">
        <label className="campo">
          <span>Modo</span>
          <select
            value={modo}
            onChange={(ev) => {
              const siguiente = ev.target.value as "automatico" | "manual";
              setModo(siguiente);
              setN(
                String(
                  siguiente === "manual"
                    ? jornada.n_manual ?? jornada.n_siguiente
                    : jornada.n_inicial,
                ),
              );
            }}
          >
            <option value="automatico">Automático</option>
            <option value="manual">Manual</option>
          </select>
        </label>
        <label className="campo">
          <span>{modo === "manual" ? "N manual" : "N inicial"}</span>
          <input
            type="number"
            min={1}
            max={10000}
            step={1}
            required
            value={n}
            onChange={(ev) => setN(ev.target.value)}
          />
        </label>
      </div>

      <div className="fila-campos ruleta-admin__fechas">
        <label className="campo">
          <span>Apertura · Chile</span>
          <input
            type="datetime-local"
            required
            value={desde}
            onChange={(ev) => setDesde(ev.target.value)}
          />
        </label>
        <label className="campo">
          <span>Cierre · Chile</span>
          <input
            type="datetime-local"
            required
            value={hasta}
            onChange={(ev) => setHasta(ev.target.value)}
          />
        </label>
      </div>

      <p className="adm__bajada">
        {esPrueba
          ? "En automático, este simulador usa solo el ritmo de las inscripciones de prueba para acercarse a 30 al cierre y puede bajar hasta N=1. No cambia N, bloques, stock ni folios reales. Abrir o cerrar las altas de ensayo sigue en Resumen."
          : "En automático, el sistema proyecta el ritmo observado para acercarse a 30 al cierre y puede bajar hasta N=1. Elegir manual detiene esos ajustes hasta que vuelvas a seleccionar Automático."}
      </p>

      {mensaje && (
        <p className={`aviso ${mensaje.startsWith("Guardado") ? "aviso--ok" : "aviso--error"}`}>
          {mensaje}
        </p>
      )}

      <div className="acciones">
        <button type="submit" className="btn btn--primario" disabled={guardando}>
          {guardando ? "Guardando…" : "Guardar configuración"}
        </button>
      </div>
    </form>
  );
}

function Cifra({
  valor,
  nombre,
}: {
  valor: number | string | null | undefined;
  nombre: string;
}) {
  return (
    <div>
      <div className="cifra__valor">{valor ?? "—"}</div>
      <div className="cifra__nombre">{nombre}</div>
    </div>
  );
}

const LOCAL = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Santiago",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  hourCycle: "h23",
});

function aFechaLocal(iso: string): string {
  const partes = LOCAL.formatToParts(new Date(iso));
  const toma = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((p) => p.type === tipo)?.value ?? "";
  return `${toma("year")}-${toma("month")}-${toma("day")}T${toma("hour")}:${toma("minute")}`;
}
