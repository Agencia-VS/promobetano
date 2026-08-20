/**
 * Fuente única de las reglas de negocio del concurso.
 *
 * Las fechas viven en variables de entorno y no en constantes del código
 * porque en una activación la ventana se mueve —se atrasa la instalación de un
 * panel, el cliente pide un día más— y cada cambio no debería costar un
 * commit, una compilación y un despliegue. Cambiar `CONCURSO_CIERRE` en Vercel
 * y redesplegar es una operación de treinta segundos que puede hacer alguien
 * que no toca el repo.
 *
 * Ojo con el huso: Chile cambia de horario en septiembre, así que un cierre
 * escrito como "23 de agosto a las 23:00" sin offset se corre una hora solo en
 * cuanto pasa el cambio. Por eso el formato exigido es ISO 8601 CON offset
 * explícito (`2026-08-23T23:00:00-04:00`) y no una fecha local ambigua.
 *
 * Se leen con funciones y no con constantes de módulo para que el valor no
 * quede congelado en el primer import: así las pruebas pueden mover la ventana
 * y el servidor recoge un cambio de variable sin reiniciar el proceso.
 */

export type EstadoConcurso = "sin_configurar" | "antes" | "abierto" | "cerrado";

/** Zona para MOSTRAR fechas. No participa en las comparaciones: esas se hacen
    entre instantes absolutos, donde el huso ya lo resolvió el offset. */
export function zona(): string {
  return process.env.CONCURSO_TZ || "America/Santiago";
}

/**
 * Una fecha inválida se trata como ausente, no como el epoch. `new Date("lo
 * que sea")` devuelve Invalid Date en vez de lanzar, y toda comparación contra
 * él da false: sin este guard, un typo en Vercel dejaría el concurso
 * permanentemente "antes de empezar" sin ningún error visible.
 */
function leeFecha(valor: string | undefined): Date | null {
  if (!valor || valor.trim() === "") return null;
  const d = new Date(valor.trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

export function inicio(): Date | null {
  return leeFecha(process.env.CONCURSO_INICIO);
}

export function cierre(): Date | null {
  return leeFecha(process.env.CONCURSO_CIERRE);
}

/**
 * Cuántos ganadores y suplentes reparte cada sorteo. Por variable de entorno y
 * no como constante por la misma razón que las fechas: son cifras del cliente,
 * y en una activación se ajustan con el sorteo ya en marcha.
 */
function leeEntero(
  valor: string | undefined,
  porDefecto: number,
  minimo: number,
): number {
  const crudo = (valor ?? "").trim();
  // Sin el guard del vacío, `Number("")` da 0 y una variable sin cargar dejaría
  // el sorteo en cero ganadores —que además la base rechaza por su CHECK—
  // en vez de caer al valor por defecto.
  if (crudo === "") return porDefecto;
  const n = Number(crudo);
  return Number.isInteger(n) && n >= minimo ? n : porDefecto;
}

export function nGanadores(): number {
  return leeEntero(process.env.CONCURSO_GANADORES, 30, 1);
}

export function nSuplentes(): number {
  return leeEntero(process.env.CONCURSO_SUPLENTES, 10, 0);
}

/**
 * Estado del concurso en un instante dado.
 *
 * `sin_configurar` es un estado explícito y no un alias de "abierto": si
 * faltan las fechas, lo correcto es que quien administre lo note, no que el
 * formulario acepte inscripciones indefinidamente porque nadie cargó la
 * variable. Una ventana invertida —cierre antes que inicio— también cae acá:
 * es un error de carga, no un concurso que ya terminó.
 */
export function estadoConcurso(ahora: Date = new Date()): EstadoConcurso {
  const desde = inicio();
  const hasta = cierre();
  if (!desde || !hasta || desde >= hasta) return "sin_configurar";
  if (ahora < desde) return "antes";
  if (ahora > hasta) return "cerrado";
  return "abierto";
}

/** Única función que decide si se acepta una inscripción. La llaman el
    formulario (para pintar el estado) y la ruta de API (para exigirlo). */
export function inscripcionesAbiertas(ahora: Date = new Date()): boolean {
  return estadoConcurso(ahora) === "abierto";
}

function formato(opciones: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("es-CL", { timeZone: zona(), ...opciones });
}

/** "viernes, 21 de agosto de 2026" */
export function fechaLarga(d: Date): string {
  return formato({
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

/** "23 de agosto" — para las placas de la portada, donde el espacio manda. */
export function fechaCorta(d: Date): string {
  return formato({ day: "numeric", month: "long" }).format(d);
}

/** "23:00" */
export function hora(d: Date): string {
  return formato({ hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}

/** "domingo, 23 de agosto de 2026 a las 23:00" */
export function fechaYHora(d: Date): string {
  return `${fechaLarga(d)} a las ${hora(d)}`;
}

/**
 * "viernes 21 de agosto" — sin coma ni año: es un nombre, no una fecha de acta.
 *
 * Se arma por partes porque `es-CL` mete una coma tras el día de la semana
 * ("viernes, 21 de agosto") y este texto va dentro de frases como «Sorteo del
 * viernes 21 de agosto», donde la coma sobra.
 */
function diaConNombre(d: Date): string {
  const partes = formato({
    weekday: "long",
    day: "numeric",
    month: "long",
  }).formatToParts(d);
  const busca = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return `${busca("weekday")} ${busca("day")} de ${busca("month")}`;
}

/**
 * El día calendario de un instante, en la zona del concurso, como "2026-08-21".
 *
 * Se arma con formatToParts y no con toISOString: toISOString da el día en UTC,
 * y a las 22:00 de Santiago ya es el día siguiente allá. Tampoco se usa
 * `toLocaleDateString("en-CA")` —que devuelve casi este formato— porque el
 * relleno con ceros depende de la implementación de ICU y esta cadena viaja a la
 * base como clave de jornada.
 */
export function diaEnZona(d: Date): string {
  const partes = formato({ year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const busca = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return `${busca("year")}-${busca("month")}-${busca("day")}`;
}

/**
 * Una jornada: el sorteo de un día y la ventana de inscripciones que entra a él.
 *
 * `hasta` no existe como campo porque sería siempre `sorteoAt`: la ventana de
 * una jornada cierra exactamente cuando se sortea. Tener dos nombres para el
 * mismo instante es la clase de duplicación que después se desincroniza.
 */
export type Jornada = {
  /** Clave del día en la zona del concurso: "2026-08-21". La usa la base. */
  dia: string;
  /** "Sorteo del viernes 21 de agosto" */
  nombre: string;
  /** Instante del sorteo, y cierre de la ventana (excluyente). */
  sorteoAt: Date;
  /** Apertura de la ventana (incluyente). */
  desde: Date;
  nGanadores: number;
  nSuplentes: number;
};

/**
 * Deriva las jornadas del calendario y, en el mismo paso, los problemas de
 * carga. Van juntos porque son la misma lectura: separarlos obligaba a recorrer
 * dos veces y permitía que una versión aceptara lo que la otra rechazaba.
 *
 * Las ventanas NO se configuran: se derivan. La primera abre en
 * `CONCURSO_INICIO` y cada una siguiente abre donde sorteó la anterior. Así son
 * contiguas por construcción y no hay forma de escribir un hueco —alguien que
 * se inscribe y no entra a ningún sorteo— ni un solape —alguien que entra a dos.
 *
 * Un calendario incoherente devuelve CERO jornadas, no las que se entiendan.
 * Es el mismo criterio que `sin_configurar` en `estadoConcurso`: ante un error
 * de carga, que no se pueda participar es recuperable en un minuto; que la gente
 * entre a la jornada equivocada no se arregla después del sorteo.
 */
function analizaCalendario(): { jornadas: Jornada[]; problemas: string[] } {
  const problemas: string[] = [];
  const desde = inicio();
  const hasta = cierre();

  if (!desde || !hasta || desde >= hasta) {
    problemas.push(
      "La ventana del concurso no está cargada: revisa CONCURSO_INICIO y CONCURSO_CIERRE.",
    );
    return { jornadas: [], problemas };
  }

  const crudos = (process.env.CONCURSO_SORTEOS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");

  if (crudos.length === 0) {
    problemas.push(
      "Falta CONCURSO_SORTEOS. Sin instantes de sorteo no hay jornadas, y sin jornadas el formulario no puede aceptar inscripciones.",
    );
    return { jornadas: [], problemas };
  }

  const instantes: Date[] = [];
  for (const crudo of crudos) {
    const d = leeFecha(crudo);
    if (!d) {
      problemas.push(
        `«${crudo}» no es una fecha ISO válida en CONCURSO_SORTEOS. Se escriben con offset explícito, por ejemplo 2026-08-21T21:00:00-04:00.`,
      );
      continue;
    }
    instantes.push(d);
  }
  if (problemas.length > 0) return { jornadas: [], problemas };

  for (let i = 0; i < instantes.length; i++) {
    const s = instantes[i];
    if (s <= desde) {
      problemas.push(
        `El sorteo del ${fechaYHora(s)} es anterior a la apertura de inscripciones: no tendría a nadie que sortear.`,
      );
    }
    if (s > hasta) {
      problemas.push(
        `El sorteo del ${fechaYHora(s)} es posterior al cierre de inscripciones.`,
      );
    }
    if (i > 0 && s <= instantes[i - 1]) {
      problemas.push(
        "Los sorteos de CONCURSO_SORTEOS tienen que ir en orden y sin repetirse.",
      );
    }
  }
  if (problemas.length > 0) return { jornadas: [], problemas };

  const jornadas: Jornada[] = [];
  let abre = desde;
  for (const sorteoAt of instantes) {
    jornadas.push({
      dia: diaEnZona(sorteoAt),
      nombre: `Sorteo del ${diaConNombre(sorteoAt)}`,
      sorteoAt,
      desde: abre,
      nGanadores: nGanadores(),
      nSuplentes: nSuplentes(),
    });
    abre = sorteoAt;
  }

  /*
   * Zona muerta: si el cierre es posterior al último sorteo, quien se inscriba
   * en el intervalo que sobra no entra a ninguna jornada. El sistema no lo
   * inventa —esa alta se rechaza— pero es un desajuste del calendario que hay
   * que ver en el panel, no descubrir con la gente reclamando.
   */
  const ultimo = instantes[instantes.length - 1];
  if (ultimo < hasta) {
    problemas.push(
      `Las inscripciones cierran el ${fechaYHora(hasta)}, después del último sorteo (${fechaYHora(ultimo)}). Quien se inscriba en esas horas no entraría a ningún sorteo: mueve CONCURSO_CIERRE al último sorteo o agrega un sorteo posterior.`,
    );
  }

  return { jornadas, problemas };
}

/** Las jornadas del concurso, en orden. Vacío si el calendario no cuadra. */
export function jornadas(): Jornada[] {
  return analizaCalendario().jornadas;
}

/**
 * Desajustes del calendario, en texto listo para mostrar en el panel. Vacío
 * cuando todo cuadra.
 */
export function problemasCalendario(): string[] {
  return analizaCalendario().problemas;
}

/**
 * La jornada a la que entra una inscripción hecha en `ahora`.
 *
 * La ventana es `[desde, sorteoAt)`: quien envía el formulario a las 21:00:00
 * exactas ya no alcanza el sorteo de ese instante y entra al siguiente. El
 * criterio tiene que ser el mismo que el de la base, que compara igual.
 */
export function jornadaDe(ahora: Date = new Date()): Jornada | null {
  return (
    jornadas().find((j) => ahora >= j.desde && ahora < j.sorteoAt) ?? null
  );
}

/** "viernes 21 de agosto a las 21:00" — absoluta, para el correo, que se abre después. */
export function fechaSorteo(d: Date): string {
  return `${diaConNombre(d)} a las ${hora(d)}`;
}

/**
 * "hoy a las 21:00" / "mañana a las 21:00" / "el domingo 23 de agosto a las 21:00".
 *
 * Relativa porque se lee en el celular en el mall, segundos después de
 * inscribirse: "hoy a las 21:00" se entiende de una y "el viernes 21 de agosto"
 * obliga a pensar qué día es hoy. Ojo con el caso que hace falta el "mañana":
 * quien se inscribe el viernes a las 21:30 entra al sorteo del SÁBADO, y decirle
 * "hoy" sería mentirle.
 */
export function etiquetaJornada(j: Jornada, ahora: Date = new Date()): string {
  const hoy = diaEnZona(ahora);
  if (j.dia === hoy) return `hoy a las ${hora(j.sorteoAt)}`;
  const dias = (Date.parse(j.dia) - Date.parse(hoy)) / 86_400_000;
  if (dias === 1) return `mañana a las ${hora(j.sorteoAt)}`;
  return `el ${fechaSorteo(j.sorteoAt)}`;
}

/**
 * Texto de la placa de la portada. Devuelve null cuando no hay nada
 * verificable que decir, para que la vista muestre su marca de "dato
 * pendiente" en vez de inventar una fecha.
 */
export function etiquetaVentana(ahora: Date = new Date()): string | null {
  const estado = estadoConcurso(ahora);
  if (estado === "sin_configurar") return null;
  if (estado === "cerrado") return "Cerradas";
  if (estado === "antes") {
    const desde = inicio();
    return desde ? `Abren el ${fechaCorta(desde)}` : null;
  }
  const hasta = cierre();
  return hasta ? `Hasta el ${fechaCorta(hasta)}` : null;
}

/**
 * De dónde salió el estado vigente. El panel necesita distinguirlo: no es lo
 * mismo "cerrado porque pasó la fecha" que "cerrado porque alguien lo cerró a
 * mano", y confundirlos lleva a esperar que se abra solo cuando no va a pasar.
 */
export type FuenteEstado = "manual" | "calendario";

export type EstadoEfectivo = {
  estado: EstadoConcurso;
  fuente: FuenteEstado;
};

/**
 * Combina el interruptor manual con el calendario. Función pura: recibe el
 * interruptor ya leído, para poder probarla sin base de datos.
 *
 * El interruptor pisa al calendario en ambos sentidos —abre fuera de fecha y
 * cierra dentro de ella— porque los dos casos ocurren: un panel que se instaló
 * tarde y una activación que hay que cortar de urgencia.
 */
export function estadoEfectivo(
  manual: boolean | null | undefined,
  ahora: Date = new Date(),
): EstadoEfectivo {
  if (manual === true) return { estado: "abierto", fuente: "manual" };
  if (manual === false) return { estado: "cerrado", fuente: "manual" };
  return { estado: estadoConcurso(ahora), fuente: "calendario" };
}

/**
 * Texto para cuando no se aceptan inscripciones.
 *
 * Vive acá y no en la página porque lo usan dos superficies —la ruta completa y
 * el modal— y un mensaje legal-adyacente que diverge entre ellas es peor que
 * uno imperfecto: la persona ve uno u otro según cómo llegó.
 *
 * Los tres estados dicen cosas distintas. Decirle "las inscripciones cerraron"
 * a alguien que llegó antes de que abrieran —o peor, porque nadie cargó las
 * fechas— es mentirle: se va creyendo que perdió su oportunidad.
 */
export function textoCierre(
  estado: EstadoConcurso,
  fuente: FuenteEstado,
): { titulo: string; detalle: string } {
  const desde = inicio();
  const hasta = cierre();

  if (estado === "antes") {
    return {
      titulo: "Todavía no abrimos",
      detalle: desde
        ? `Las inscripciones abren el ${fechaYHora(desde)}. Vuelve a escanear el código ese día.`
        : "Vuelve a escanear el código más tarde.",
    };
  }

  if (estado === "sin_configurar") {
    return {
      titulo: "Inscripciones en pausa",
      detalle: "Vuelve a escanear el código más tarde.",
    };
  }

  return {
    titulo: "Las inscripciones cerraron",
    detalle:
      fuente === "manual"
        ? "Las inscripciones están cerradas por ahora. Vuelve a intentar más tarde."
        : hasta
          ? `El plazo terminó el ${fechaYHora(hasta)}. Gracias por pasar.`
          : "Gracias por pasar.",
  };
}
