import { test } from "node:test";
import assert from "node:assert/strict";
import {
  estadoConcurso,
  fechaCorta,
  fechaYHora,
  etiquetaVentana,
  inscripcionesAbiertas,
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
