import { strict as assert } from "node:assert";
import { test } from "node:test";
import { confirmaResultado } from "../lib/resultado-inscripcion.ts";

const contexto = { email: "  ana@correo.cl ", origen: "panel-1" };

test("acepta una decisión perdedora explícita", () => {
  assert.deepEqual(
    confirmaResultado(
      {
        ok: true,
        ganador: false,
        numero_ganador: null,
        sorteo: "viernes 21 de agosto",
        pruebas: false,
      },
      contexto,
    ),
    {
      email: "ana@correo.cl",
      origen: "panel-1",
      ganador: false,
      numeroGanador: undefined,
      sorteo: "viernes 21 de agosto",
      pruebas: false,
    },
  );
});

test("acepta un ganador real solo cuando trae un folio válido", () => {
  const confirmado = confirmaResultado(
    {
      ok: true,
      ganador: true,
      numero_ganador: 18,
      sorteo: null,
      pruebas: false,
    },
    contexto,
  );
  assert.equal(confirmado?.ganador, true);
  assert.equal(confirmado?.numeroGanador, 18);

  assert.equal(
    confirmaResultado(
      { ok: true, ganador: true, numero_ganador: null, pruebas: false },
      contexto,
    ),
    null,
  );
  assert.equal(
    confirmaResultado(
      { ok: true, ganador: true, numero_ganador: 91, pruebas: false },
      contexto,
    ),
    null,
  );
});

test("acepta el correlativo aislado del modo pruebas", () => {
  const confirmado = confirmaResultado(
    { ok: true, ganador: true, numero_ganador: 125, pruebas: true },
    contexto,
  );
  assert.equal(confirmado?.pruebas, true);
  assert.equal(confirmado?.numeroGanador, 125);
});

test("nunca convierte una respuesta incompleta en perdedor", () => {
  for (const cuerpo of [
    null,
    {},
    { ok: true },
    { ok: true, ganador: "false" },
    { ok: false, ganador: false },
    { ok: true, ganador: false, numero_ganador: 7 },
  ]) {
    assert.equal(confirmaResultado(cuerpo, contexto), null);
  }
});
