import { test } from "node:test";
import assert from "node:assert/strict";
import {
  diaSorteo,
  estadoConcurso,
  etiquetaVentana,
  fechaCorta,
  fechaSorteo,
  fechaYHora,
  inscripcionesAbiertas,
  jornadaDe,
  jornadas,
  nGanadores,
  nSuplentes,
  problemasCalendario,
} from "../lib/concurso.ts";

/** Fija la ventana en el entorno y devuelve una función para restaurarla. */
function conVentana(inicio?: string, cierre?: string, tz = "America/Santiago") {
  const previo = {
    i: process.env.CONCURSO_INICIO,
    c: process.env.CONCURSO_CIERRE,
    z: process.env.CONCURSO_TZ,
  };
  if (inicio === undefined) delete process.env.CONCURSO_INICIO;
  else process.env.CONCURSO_INICIO = inicio;
  if (cierre === undefined) delete process.env.CONCURSO_CIERRE;
  else process.env.CONCURSO_CIERRE = cierre;
  process.env.CONCURSO_TZ = tz;

  return () => {
    restaura("CONCURSO_INICIO", previo.i);
    restaura("CONCURSO_CIERRE", previo.c);
    restaura("CONCURSO_TZ", previo.z);
  };
}

function restaura(clave: string, valor: string | undefined) {
  if (valor === undefined) delete process.env[clave];
  else process.env[clave] = valor;
}

const INICIO = "2026-08-21T05:00:00-04:00";
const CIERRE = "2026-08-23T23:00:00-04:00";

test("sin fechas cargadas el concurso NO queda abierto", () => {
  const fin = conVentana(undefined, undefined);
  assert.equal(estadoConcurso(), "sin_configurar");
  // Lo importante: la ausencia de configuración cierra, no abre. Si abriera,
  // un despliegue sin variables aceptaría inscripciones para siempre.
  assert.equal(inscripcionesAbiertas(), false);
  fin();
});

test("una fecha con typo se trata como ausente, no como el epoch", () => {
  const fin = conVentana("21 de agosto", CIERRE);
  // new Date("21 de agosto") es Invalid Date y toda comparación da false: sin
  // el guard, el concurso quedaría permanentemente "antes de empezar".
  assert.equal(estadoConcurso(), "sin_configurar");
  fin();
});

test("una ventana invertida es un error de carga, no un concurso terminado", () => {
  const fin = conVentana(CIERRE, INICIO);
  assert.equal(estadoConcurso(), "sin_configurar");
  fin();
});

test("los tres estados de la ventana real", () => {
  const fin = conVentana(INICIO, CIERRE);

  assert.equal(estadoConcurso(new Date("2026-08-20T12:00:00-04:00")), "antes");
  assert.equal(estadoConcurso(new Date("2026-08-21T05:00:01-04:00")), "abierto");
  assert.equal(estadoConcurso(new Date("2026-08-22T15:00:00-04:00")), "abierto");
  assert.equal(estadoConcurso(new Date("2026-08-23T22:59:59-04:00")), "abierto");
  assert.equal(estadoConcurso(new Date("2026-08-23T23:00:01-04:00")), "cerrado");

  fin();
});

test("los bordes son inclusivos en ambos extremos", () => {
  const fin = conVentana(INICIO, CIERRE);
  assert.equal(estadoConcurso(new Date(INICIO)), "abierto");
  assert.equal(estadoConcurso(new Date(CIERRE)), "abierto");
  fin();
});

test("el cierre se compara en instantes absolutos, no en hora local", () => {
  const fin = conVentana(INICIO, CIERRE);
  // Las 23:00 del domingo en Santiago son las 03:00 del lunes en UTC. Un
  // servidor en UTC —como los de Vercel— tiene que cerrar en el mismo momento
  // que un teléfono en Santiago, no seis horas antes.
  assert.equal(estadoConcurso(new Date("2026-08-24T02:59:00Z")), "abierto");
  assert.equal(estadoConcurso(new Date("2026-08-24T03:00:01Z")), "cerrado");
  fin();
});

test("las fechas se muestran en la zona de Chile aunque el proceso corra en UTC", () => {
  const fin = conVentana(INICIO, CIERRE);
  const texto = fechaYHora(new Date(CIERRE));
  assert.match(texto, /domingo/);
  assert.match(texto, /23 de agosto de 2026/);
  // 23:00 en Santiago. Si se formateara en UTC diría 03:00 del día 24.
  assert.match(texto, /23:00/);
  assert.equal(fechaCorta(new Date(INICIO)), "21 de agosto");
  fin();
});

test("la etiqueta de la portada nunca inventa una fecha", () => {
  const sin = conVentana(undefined, undefined);
  assert.equal(etiquetaVentana(), null);
  sin();

  const fin = conVentana(INICIO, CIERRE);
  assert.equal(
    etiquetaVentana(new Date("2026-08-20T12:00:00-04:00")),
    "Abren el 21 de agosto",
  );
  assert.equal(
    etiquetaVentana(new Date("2026-08-22T12:00:00-04:00")),
    "Hasta el 23 de agosto",
  );
  assert.equal(etiquetaVentana(new Date("2026-08-24T12:00:00-04:00")), "Cerradas");
  fin();
});

// ═══════════════════════════════════════════════════════════════════════════
// Jornadas: tres sorteos diarios a las 21:00 de Santiago.
//
// Lo que estas pruebas protegen no es el formato de una fecha: es que nadie se
// inscriba y quede fuera de todo sorteo, y que nadie entre a dos. Las ventanas
// se derivan del calendario justo para que esos dos casos sean imposibles de
// escribir, y acá se comprueba que la derivación aguanta.
// ═══════════════════════════════════════════════════════════════════════════

const SORTEOS =
  "2026-08-21T21:00:00-04:00,2026-08-22T21:00:00-04:00,2026-08-23T21:00:00-04:00";
/** El cierre real coincide con el último sorteo: sin ese ajuste hay zona muerta. */
const CIERRE_REAL = "2026-08-23T21:00:00-04:00";

type Calendario = {
  inicio?: string;
  cierre?: string;
  sorteos?: string;
  ganadores?: string;
  suplentes?: string;
};

/** Igual que conVentana, pero también con el calendario de sorteos. */
function conCalendario(c: Calendario) {
  const claves = [
    "CONCURSO_INICIO",
    "CONCURSO_CIERRE",
    "CONCURSO_SORTEOS",
    "CONCURSO_GANADORES",
    "CONCURSO_SUPLENTES",
    "CONCURSO_TZ",
  ] as const;
  const previo = new Map(claves.map((k) => [k, process.env[k]]));

  const nuevo: Record<string, string | undefined> = {
    CONCURSO_INICIO: c.inicio,
    CONCURSO_CIERRE: c.cierre,
    CONCURSO_SORTEOS: c.sorteos,
    CONCURSO_GANADORES: c.ganadores,
    CONCURSO_SUPLENTES: c.suplentes,
    CONCURSO_TZ: "America/Santiago",
  };
  for (const k of claves) restaura(k, nuevo[k]);

  return () => {
    for (const k of claves) restaura(k, previo.get(k));
  };
}

const CALENDARIO_REAL: Calendario = {
  inicio: INICIO,
  cierre: CIERRE_REAL,
  sorteos: SORTEOS,
};

test("las tres jornadas cubren la ventana completa, sin huecos ni solapes", () => {
  const fin = conCalendario(CALENDARIO_REAL);
  const js = jornadas();

  assert.equal(js.length, 3);
  assert.deepEqual(
    js.map((j) => j.dia),
    ["2026-08-21", "2026-08-22", "2026-08-23"],
  );

  // La primera abre cuando abren las inscripciones: nadie queda antes.
  assert.equal(js[0].desde.toISOString(), new Date(INICIO).toISOString());
  // Cada una abre donde sorteó la anterior: ni un instante sin jornada, ni uno
  // en dos jornadas.
  assert.equal(js[1].desde.toISOString(), js[0].sorteoAt.toISOString());
  assert.equal(js[2].desde.toISOString(), js[1].sorteoAt.toISOString());
  // La última cierra en el cierre del concurso: nadie queda después.
  assert.equal(js[2].sorteoAt.toISOString(), new Date(CIERRE_REAL).toISOString());

  assert.deepEqual(problemasCalendario(), []);
  fin();
});

test("el nombre y la clave de la jornada se calculan en Chile, no en UTC", () => {
  const fin = conCalendario(CALENDARIO_REAL);
  const js = jornadas();

  // Las 21:00 del viernes en Santiago son la 01:00 UTC del sábado. Con la clave
  // en UTC, la jornada del viernes se llamaría "2026-08-22" y el sorteo del
  // viernes se ejecutaría sobre la gente del sábado.
  assert.equal(js[0].sorteoAt.toISOString(), "2026-08-22T01:00:00.000Z");
  assert.equal(js[0].dia, "2026-08-21");
  assert.equal(js[0].nombre, "Sorteo del viernes 21 de agosto");
  assert.equal(js[2].nombre, "Sorteo del domingo 23 de agosto");
  fin();
});

test("a las 21:00 en punto ya se entra al sorteo siguiente", () => {
  const fin = conCalendario(CALENDARIO_REAL);

  // Un segundo antes: alcanza el sorteo de esta noche.
  assert.equal(
    jornadaDe(new Date("2026-08-21T20:59:59-04:00"))?.dia,
    "2026-08-21",
  );
  // En punto: la ventana es [desde, sorteoAt), así que ya es del sábado. El
  // criterio tiene que ser el mismo que el `< ventana_hasta` de la base.
  assert.equal(
    jornadaDe(new Date("2026-08-21T21:00:00-04:00"))?.dia,
    "2026-08-22",
  );
  fin();
});

test("quien se inscribe el viernes de noche entra al sorteo del sábado", () => {
  const fin = conCalendario(CALENDARIO_REAL);
  const ahora = new Date("2026-08-21T22:30:00-04:00");
  const j = jornadaDe(ahora);

  assert.equal(j?.dia, "2026-08-22");
  // Y se lo decimos con el día, no con un "hoy": el sorteo de hoy ya se hizo
  // hora y media antes, así que "hoy" sería mentirle.
  assert.equal(diaSorteo(j!.sorteoAt), "sábado 22 de agosto");
  fin();
});

test("lo que ve la persona es el día del sorteo, sin hora", () => {
  const fin = conCalendario(CALENDARIO_REAL);
  const dia = diaSorteo(new Date("2026-08-21T21:00:00-04:00"));

  assert.equal(dia, "viernes 21 de agosto");
  // La regresión que esto impide: el correo decía "a las 05:00" —la APERTURA de
  // la ventana, no un sorteo— porque el instante que llega es el cierre de la
  // jornada y en la ventana de ensayo ese cierre se recorta al inicio de la
  // primera jornada real. Sin hora, el día sale correcto en los dos casos.
  assert.doesNotMatch(dia, /a las|\d{2}:\d{2}/);
  fin();
});

test("el mismo instante en la ventana de ensayo da el día correcto", () => {
  const fin = conCalendario(CALENDARIO_REAL);
  // ventana_hasta de la jornada de prueba: las 05:00 del viernes, que es la
  // apertura de la primera jornada real. El día que se anuncia es el mismo.
  assert.equal(
    diaSorteo(new Date("2026-08-21T05:00:00-04:00")),
    "viernes 21 de agosto",
  );
  fin();
});

test("en las bases la fecha del sorteo sí lleva la hora", () => {
  const fin = conCalendario(CALENDARIO_REAL);
  // Único consumidor: la enumeración de sorteos de /bases. En un texto legal el
  // instante es parte de lo que se declara, así que ahí la hora no se quita.
  assert.equal(
    fechaSorteo(new Date("2026-08-21T21:00:00-04:00")),
    "viernes 21 de agosto a las 21:00",
  );
  fin();
});

test("fuera de la ventana no hay jornada a la que entrar", () => {
  const fin = conCalendario(CALENDARIO_REAL);
  assert.equal(jornadaDe(new Date("2026-08-21T04:59:00-04:00")), null);
  assert.equal(jornadaDe(new Date("2026-08-23T21:00:01-04:00")), null);
  fin();
});

test("sin CONCURSO_SORTEOS no se inventa ninguna jornada", () => {
  const fin = conCalendario({ inicio: INICIO, cierre: CIERRE_REAL });
  assert.deepEqual(jornadas(), []);
  assert.equal(jornadaDe(new Date("2026-08-22T13:00:00-04:00")), null);
  assert.equal(problemasCalendario().length, 1);
  assert.match(problemasCalendario()[0], /CONCURSO_SORTEOS/);
  fin();
});

test("un sorteo con typo no deja pasar las jornadas que sí se entienden", () => {
  // Aceptar las válidas y descartar la del medio uniría dos ventanas en
  // silencio: la gente del sábado entraría al sorteo del domingo sin que nadie
  // lo note hasta después de sortear.
  const fin = conCalendario({
    inicio: INICIO,
    cierre: CIERRE_REAL,
    sorteos: `2026-08-21T21:00:00-04:00,22 de agosto,2026-08-23T21:00:00-04:00`,
  });
  assert.deepEqual(jornadas(), []);
  assert.match(problemasCalendario().join(" "), /22 de agosto/);
  fin();
});

test("sorteos desordenados o repetidos son un error de carga, no un orden a adivinar", () => {
  const fin = conCalendario({
    inicio: INICIO,
    cierre: CIERRE_REAL,
    sorteos: `2026-08-23T21:00:00-04:00,2026-08-21T21:00:00-04:00`,
  });
  assert.deepEqual(jornadas(), []);
  assert.match(problemasCalendario().join(" "), /en orden/);
  fin();
});

test("un sorteo anterior a la apertura o posterior al cierre se avisa", () => {
  const antes = conCalendario({
    inicio: INICIO,
    cierre: CIERRE_REAL,
    sorteos: "2026-08-20T21:00:00-04:00",
  });
  assert.deepEqual(jornadas(), []);
  assert.match(problemasCalendario().join(" "), /anterior a la apertura/);
  antes();

  const despues = conCalendario({
    inicio: INICIO,
    cierre: CIERRE_REAL,
    sorteos: "2026-08-24T21:00:00-04:00",
  });
  assert.deepEqual(jornadas(), []);
  assert.match(problemasCalendario().join(" "), /posterior al cierre/);
  despues();
});

test("un cierre posterior al último sorteo se denuncia como zona muerta", () => {
  // Es el defecto que traía la configuración: cierre el domingo a las 23:00 con
  // el último sorteo a las 21:00. Dos horas inscribiéndose para nada.
  const fin = conCalendario({
    inicio: INICIO,
    cierre: "2026-08-23T23:00:00-04:00",
    sorteos: SORTEOS,
  });

  // Las jornadas siguen valiendo: el problema son las dos horas que sobran, no
  // las tres jornadas que sí están bien.
  assert.equal(jornadas().length, 3);
  assert.match(problemasCalendario().join(" "), /no entraría a ningún sorteo/);
  // Y esas dos horas, en la práctica, no aceptan inscripciones.
  assert.equal(jornadaDe(new Date("2026-08-23T22:00:00-04:00")), null);
  fin();
});

test("los cupos salen del entorno y tienen un valor por defecto usable", () => {
  const porDefecto = conCalendario(CALENDARIO_REAL);
  assert.equal(nGanadores(), 30);
  assert.equal(nSuplentes(), 10);
  assert.equal(jornadas()[0].nGanadores, 30);
  porDefecto();

  const cargados = conCalendario({
    ...CALENDARIO_REAL,
    ganadores: "5",
    suplentes: "2",
  });
  assert.equal(jornadas()[1].nGanadores, 5);
  assert.equal(jornadas()[1].nSuplentes, 2);
  cargados();

  // Un valor con typo no deja el sorteo en cero ganadores, que además la base
  // rechazaría por su CHECK: se cae al valor por defecto.
  const roto = conCalendario({ ...CALENDARIO_REAL, ganadores: "treinta" });
  assert.equal(nGanadores(), 30);
  roto();
});
