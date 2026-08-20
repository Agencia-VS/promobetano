import { strict as assert } from "node:assert";
import { test } from "node:test";
import { escapaHtml, plantilla, primerNombre, type TipoCorreo } from "../lib/email.ts";
import { baseAbsoluta, urlAbsoluta } from "../lib/sitio.ts";

const TIPOS: TipoCorreo[] = ["confirmacion", "ganador"];

/** Las plantillas leen el dominio de process.env al renderizar, así que se
    puede mover entre casos sin recargar el módulo. */
function conDominio<T>(valor: string | undefined, fn: () => T): T {
  const previoSitio = process.env.NEXT_PUBLIC_SITE_URL;
  const previoVercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (valor === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = valor;
  delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  try {
    return fn();
  } finally {
    if (previoSitio === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = previoSitio;
    if (previoVercel === undefined)
      delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    else process.env.VERCEL_PROJECT_PRODUCTION_URL = previoVercel;
  }
}

test("los dos tipos compatibles con la cola renderizan", () => {
  // `confirmacion` se conserva para filas históricas aunque el hotfix ya no la
  // encola. El cron todavía debe poder drenar una fila antigua sin romperse.
  for (const tipo of TIPOS) {
    const p = plantilla(tipo, "Ana María Pérez");
    assert.ok(p.asunto.length > 0, `${tipo}: sin asunto`);
    assert.ok(p.html.startsWith("<!doctype html>"), `${tipo}: html mal formado`);
    assert.ok(p.texto.length > 0, `${tipo}: sin versión de texto`);
    assert.ok(p.html.includes("Ana"), `${tipo}: no saluda`);
    assert.ok(p.texto.includes("Ana"), `${tipo}: el texto no saluda`);
  }
});

test("un nombre con HTML no se inyecta en el correo", () => {
  const malicioso = '<img src=x onerror="alert(1)">Ana';
  for (const tipo of TIPOS) {
    const { html, asunto } = plantilla(tipo, malicioso);
    assert.ok(
      !html.includes("onerror="),
      `${tipo}: el atributo llegó crudo al HTML`,
    );
    assert.ok(!asunto.includes("<img"), `${tipo}: el asunto lleva etiquetas`);
  }
  assert.equal(escapaHtml("<b>&'\""), "&lt;b&gt;&amp;&#39;&quot;");
});

test("sin dominio configurado no se emite ninguna imagen", () => {
  // Una ruta relativa en un correo no resuelve contra nada: se vería el icono
  // de imagen rota. Es preferible un correo sin logo.
  conDominio(undefined, () => {
    assert.equal(baseAbsoluta(), null);
    for (const tipo of TIPOS) {
      const { html } = plantilla(tipo, "Ana");
      assert.ok(!html.includes("<img"), `${tipo}: emitió una imagen sin base`);
      assert.ok(
        !html.includes('src="/'),
        `${tipo}: coló una ruta relativa`,
      );
    }
  });
});

test("solo la confirmación conserva el lockup de campaña", () => {
  conDominio("https://eaudeconfianza.cl", () => {
    const confirmacion = plantilla("confirmacion", "Ana").html;
    const ganador = plantilla("ganador", "Ana", null, 1).html;
    assert.match(confirmacion, /https:\/\/eaudeconfianza\.cl\/email\/lockup-600\.png/);
    assert.doesNotMatch(confirmacion, /alt=""/);
    assert.doesNotMatch(ganador, /<img|lockup-600/);
  });
});

test("el respaldo ganador no lleva imágenes ni tablas decorativas", () => {
  conDominio("https://eaudeconfianza.cl", () => {
    const { html } = plantilla("ganador", "Ana", null, 1);
    assert.doesNotMatch(html, /<img|<table|iso-96|lockup-600/);
    assert.doesNotMatch(html, /Resultado confirmado|Saliste sorteado/i);
  });
});

test("la barra final del dominio no duplica la de la ruta", () => {
  conDominio("https://eaudeconfianza.cl/", () => {
    assert.equal(baseAbsoluta(), "https://eaudeconfianza.cl");
    assert.equal(
      urlAbsoluta("/email/lockup-600.png"),
      "https://eaudeconfianza.cl/email/lockup-600.png",
    );
  });
});

test("VERCEL_PROJECT_PRODUCTION_URL sirve de respaldo", () => {
  const previo = process.env.NEXT_PUBLIC_SITE_URL;
  const previoV = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  delete process.env.NEXT_PUBLIC_SITE_URL;
  process.env.VERCEL_PROJECT_PRODUCTION_URL = "promobetano.vercel.app";
  try {
    assert.equal(baseAbsoluta(), "https://promobetano.vercel.app");
  } finally {
    if (previo === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = previo;
    if (previoV === undefined) delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    else process.env.VERCEL_PROJECT_PRODUCTION_URL = previoV;
  }
});

test("el correo de ganador es un respaldo simple con su folio", () => {
  const { asunto, html, texto } = plantilla(
    "ganador",
    "Ana Pérez",
    null,
    7,
  );
  assert.match(asunto, /confiaste y ganaste/i);
  assert.match(html, /¡Confiaste y ganaste!/);
  assert.match(html, /si aún no has retirado tu premio/i);
  assert.match(html, /acércate al stand de premiación/i);
  assert.match(texto, /acércate al stand de premiación/i);
  assert.match(html, /Si ya retiraste tu premio, puedes omitir este correo/i);
  assert.match(texto, /Si ya retiraste tu premio, puedes omitir este correo/i);
  assert.match(html, /Número de ganador/);
  assert.match(html, /#007/);
  assert.match(texto, /Número de ganador: #007/);
  assert.doesNotMatch(html, /el equipo se contactará contigo/i);
  assert.doesNotMatch(html, /Te lo ganaste|Abre la botella/i);
});

test("el ganador de ensayo recibe un correlativo PRUEBA separado", () => {
  const { html, texto } = plantilla("ganador", "Ana Pérez", null, null, 2);
  assert.match(html, /Número de prueba/);
  assert.match(html, /PRUEBA 2/);
  assert.match(texto, /Número de prueba: PRUEBA 2/);
  assert.doesNotMatch(html, /#002/);
  assert.doesNotMatch(texto, /Número de ganador/);
});

test("la confirmación conserva los pasos y el respaldo de ganador es breve", () => {
  // En la confirmación todavía no se ganó nada: «si te lo ganas». En el correo
  // de ganador el premio ya es de la persona: «te lo ganaste». Mezclarlos es
  // el error de copy que esta campaña no puede permitirse en una pieza legal.
  const conf = plantilla("confirmacion", "Ana");
  assert.match(conf.html, /Si te lo ganas, así se usa/);
  assert.match(conf.texto, /Si te lo ganas, así se usa/);
  assert.doesNotMatch(conf.html, /Te lo ganaste/);

  const gan = plantilla("ganador", "Ana", null, 1);
  assert.doesNotMatch(gan.html, /así se usa/);
  assert.doesNotMatch(gan.texto, /Abre la botella/);
  assert.match(gan.texto, /#001/);
});

test("la confirmación dice que nos comunicaremos solo si gana", () => {
  const { html, texto } = plantilla("confirmacion", "Ana");
  assert.match(html, /Si ganas, nos comunicaremos contigo/);
  assert.match(texto, /Si ganas, nos comunicaremos contigo/);

  // La frase larga que la reemplazó no debe volver por un merge distraído.
  assert.ok(
    !/Si sales sorteado, te escribimos/i.test(html),
    "volvió la frase que se pidió eliminar",
  );

  // Pero los pasos del perfume se quedan: son «algo de la campaña».
  assert.match(html, /Abre la botella/);
});

test("todo correo lleva el aviso 18+ y el contacto de datos", () => {
  // Obligatorio en toda pieza de una marca de apuestas (reglas 17 y legal).
  for (const tipo of TIPOS) {
    const { html, texto } = plantilla(tipo, "Ana");
    assert.match(html, /mayores de 18 años/i, `${tipo}: falta el 18+ en html`);
    assert.match(html, /Juega con responsabilidad/i, `${tipo}: falta el aviso`);
    assert.match(texto, /mayores de 18 años/i, `${tipo}: falta el 18+ en texto`);
  }
});

test("primerNombre no deja el saludo vacío", () => {
  assert.equal(primerNombre("Ana María Pérez"), "Ana");
  assert.equal(primerNombre("  Ana  "), "Ana");
  assert.equal(primerNombre(""), "hola");
  assert.equal(primerNombre("   "), "hola");
});

// ═══════════════════════════════════════════════════════════════════════════
// La jornada en el correo de confirmación.
//
// Con tres sorteos diarios, quien se inscribe el viernes a las 21:30 entra al
// del SÁBADO. Sin esta línea se queda esperando el resultado del viernes, que ya
// se hizo, y termina escribiendo para reclamar algo que nunca le correspondió.
// ═══════════════════════════════════════════════════════════════════════════

const SORTEO_VIERNES = new Date("2026-08-21T21:00:00-04:00");

/** La fecha se formatea en la zona del concurso, no en la del proceso. */
function conZona<T>(fn: () => T): T {
  const previo = process.env.CONCURSO_TZ;
  process.env.CONCURSO_TZ = "America/Santiago";
  try {
    return fn();
  } finally {
    if (previo === undefined) delete process.env.CONCURSO_TZ;
    else process.env.CONCURSO_TZ = previo;
  }
}

test("la confirmación dice a qué sorteo entró la persona", () => {
  const { html, texto, asunto } = conZona(() =>
    plantilla("confirmacion", "Ana", SORTEO_VIERNES),
  );

  // El día, absoluto y sin hora. Absoluto porque el correo se abre horas
  // después, puede que otro día, y un "hoy" ahí no significa nada. Sin hora
  // porque el instante que llega es el cierre de la jornada, y en la ventana de
  // ensayo ese cierre se recorta a las 05:00 de la apertura real: el correo
  // anunciaba "sorteo a las 05:00", que es una apertura y no un sorteo.
  assert.match(html, /Entras al sorteo del viernes 21 de agosto\./);
  assert.match(texto, /Entras al sorteo del viernes 21 de agosto\./);
  assert.doesNotMatch(html, /sorteo del [^.]*a las/);
  assert.doesNotMatch(texto, /sorteo del [^.]*a las/);
  // Y sigue estando la frase que el equipo dejó escrita.
  assert.match(html, /Si ganas, nos comunicaremos contigo/);
  // El asunto no cambia: la fecha va en el cuerpo, no en la bandeja.
  assert.equal(asunto, "Recibimos tu inscripción — Eau de Confianza");
});

test("sin instante de sorteo la confirmación no inventa una fecha", () => {
  for (const sin of [undefined, null]) {
    const { html, texto } = plantilla("confirmacion", "Ana", sin);
    assert.doesNotMatch(html, /Entras al sorteo/);
    assert.doesNotMatch(texto, /Entras al sorteo/);
    // Y queda exactamente como antes de que existieran las jornadas.
    assert.match(html, /Si ganas, nos comunicaremos contigo/);
    assert.match(texto, /Si ganas, nos comunicaremos contigo/);
  }
});

test("el correo de ganador no habla de la jornada", () => {
  // Es la consecuencia del sorteo: decir cuándo fue no le aporta nada a quien
  // ya sabe el resultado, y prometer una fecha de entrega es justo lo que no
  // se puede hacer con la decisión 04 abierta.
  const { html } = conZona(() => plantilla("ganador", "Ana", SORTEO_VIERNES));
  assert.doesNotMatch(html, /Entras al sorteo/);
});
