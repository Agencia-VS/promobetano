-- ═══════════════════════════════════════════════════════════════════════════
-- Jornadas: tres sorteos diarios, una inscripción por persona y por jornada.
--
-- Respuestas del cliente (19 ago 2026) a las decisiones abiertas 02 y 03:
--
--   · TRES sorteos, uno por día, cada uno a las 21:00 de Santiago:
--     viernes 21, sábado 22 y domingo 23 de agosto de 2026.
--   · 30 ganadores y 10 suplentes por sorteo.
--   · Una inscripción entra SOLO al sorteo de su propio día, nunca a los
--     siguientes.
--   · Una persona puede inscribirse una vez POR DÍA (hasta tres veces), pero
--     gana como máximo UNA vez en toda la activación.
--   · Las inscripciones cierran el domingo a las 21:00 —no a las 23:00, como
--     estaba cargado— para que la última ventana termine exactamente en el
--     último sorteo. Con el cierre a las 23:00 había dos horas en que la gente
--     se inscribía y no entraba a ningún sorteo.
--   · La ejecución sigue siendo MANUAL: alguien aprieta «Ejecutar» a las 21:00.
--
-- ── Por qué esto SÍ toca el esquema ─────────────────────────────────────────
--
-- El brief prometía que al responderse estas decisiones «se cargan filas, no se
-- toca el esquema», y conviene dejar escrito por qué no se pudo cumplir antes de
-- que alguien lo lea como pereza:
--
--   La unicidad global sobre `documento_norm` y `email_norm` tiene que pasar a
--   ser unicidad POR JORNADA. Eso exige una columna que diga a qué jornada
--   pertenece la fila, y esa columna NO puede ser generada: Postgres exige
--   expresiones IMMUTABLE en las columnas generadas, y `creado_at AT TIME ZONE
--   'America/Santiago'` es STABLE. No hay forma de expresar «un RUT por día»
--   sin una columna escrita al insertar.
--
-- Quedaban dos caminos, no muchos:
--
--   (A) una columna `jornada date` escrita por trigger, con el corte de las
--       21:00 y la zona de Chile escritos en el SQL;
--   (B) una columna `sorteo_id` con clave ajena a `sorteos`, resuelta contra la
--       ventana de la propia fila de sorteos.
--
-- Se eligió (B). (A) obliga a escribir en SQL
-- `((creado_at at time zone 'America/Santiago') - interval '21 hours')::date`
-- —el corte no es medianoche: las inscripciones se aceptan de corrido toda la
-- noche y el sorteo es a las 21:00— y esa aritmética duplica la fuente de verdad
-- del calendario, que ya vive en `lib/concurso.ts` y en las variables de
-- entorno; reintroduce el huso en las comparaciones, que es justo lo que ese
-- módulo documenta que no se hace; y se rompe sola —en silencio, metiendo a
-- alguien en un sorteo ya ejecutado— el día que cambie la hora del sorteo o la
-- activación caiga sobre el cambio de horario de septiembre.
--
-- Con (B) no hay ni una operación de fecha en todo el archivo: los límites son
-- los `timestamptz` de las filas de sorteos, cargados con offset explícito.
--
-- El argumento más fuerte de (B) no es el rendimiento —un índice de rango sobre
-- `creado_at` lee exactamente las mismas filas que una igualdad— sino la
-- auditoría: hoy nada impide un `update sorteos set ventana_desde = ...` sobre
-- un sorteo YA ejecutado, y con la ventana como criterio eso cambia en silencio
-- quién «debía» estar en el pool. Con `sorteo_id` la pertenencia queda escrita
-- fila por fila y reescribir la ventana no la puede tocar.
--
-- ── Convención de la ventana: SEMIABIERTA [desde, hasta) ────────────────────
--
-- `J2.ventana_desde = J1.ventana_hasta` exactamente. Eso es lo que hace verdad
-- la frase «sin zona muerta»: el instante 21:00:00.000 pertenece a una sola
-- jornada —la siguiente— y no hay un microsegundo que no pertenezca a ninguna.
-- Una restricción EXCLUDE lo garantiza en el esquema y no en la disciplina de
-- quien cargue las fechas la próxima vez.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- 1. sorteos: clave estable, criterio del pool y exclusión de premiados
-- ───────────────────────────────────────────────────────────────────────────

-- La clave de negocio de la jornada. La idempotencia de «cargar las tres
-- jornadas» NO puede ir sobre (ventana_desde, ventana_hasta): en una activación
-- las fechas se mueven —es el motivo por el que viven en variables de entorno— y
-- con la ventana como clave, mover el viernes media hora crearía una CUARTA fila
-- en vez de corregir la primera, que es justo el accidente que la idempotencia
-- debía evitar.
alter table public.sorteos add column if not exists clave text;

comment on column public.sorteos.clave is
  'Clave de negocio estable de la jornada (jornada-1, jornada-2, ...). '
  'Sobrevive a un cambio de fechas y es la clave de idempotencia de '
  'cargar_jornadas. Null en los sorteos ad-hoc que crea crear_sorteo.';

-- NULLS DISTINCT, que es el comportamiento por defecto: los sorteos ad-hoc con
-- clave null no compiten entre sí por esta unicidad. Sin `where`, para que
-- `on conflict (clave)` pueda inferirlo.
create unique index if not exists sorteos_clave_key
  on public.sorteos (clave);

-- Qué universo entra al pool. 'ventana' es el comportamiento HISTÓRICO y por eso
-- es el valor por defecto: el botón «Crear borrador» del panel sigue creando
-- sorteos con semántica de ventana en vez de convertirse en una trampa que
-- produce sorteos imposibles de ejecutar —con el pool por `sorteo_id`, un sorteo
-- ad-hoc sin jornada tendría cero participantes y moriría al ejecutarse—.
--
-- Se guarda por fila y no como una rama del código por auditoría: dentro de seis
-- meses el SQL desplegado puede ser otro, y la pregunta «¿qué regla decidió ESTE
-- sorteo?» la tiene que contestar la fila, no un git blame.
alter table public.sorteos
  add column if not exists criterio text not null default 'ventana';

-- Si quien ya tiene premio en otra jornada queda fuera. Decisión del cliente del
-- 19 de agosto: un premio por persona. Es una columna y no una rama del código
-- por lo mismo que `criterio`, y además porque apagarla o encenderla cambia lo
-- que dicen las bases: no es un ajuste de producto, es un cambio legal.
alter table public.sorteos
  add column if not exists excluir_premiados boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sorteos_criterio_valido') then
    alter table public.sorteos add constraint sorteos_criterio_valido
      check (criterio in ('ventana','jornada'));
  end if;

  -- Una jornada sin ventana no es una jornada: sin los dos extremos no hay forma
  -- de resolver a qué sorteo entra una inscripción.
  if not exists (select 1 from pg_constraint where conname = 'sorteos_jornada_con_ventana') then
    alter table public.sorteos add constraint sorteos_jornada_con_ventana
      check (criterio <> 'jornada'
             or (ventana_desde is not null and ventana_hasta is not null));
  end if;

  -- Solapes. Sin esto, dos jornadas que se pisan hacen que la resolución de
  -- jornada sea NO DETERMINISTA —dos filas candidatas y un `limit 1` arbitrario—
  -- y una persona acabaría en la jornada que eligió el planificador.
  --
  -- DEFERRABLE porque correr el horario completo es un UPDATE por fila: mover las
  -- tres jornadas una hora produce un solape TRANSITORIO al actualizar la
  -- primera, y una EXCLUDE inmediata abortaría la carga. `cargar_jornadas` la
  -- difiere al final de su transacción.
  --
  -- Los 'anulado' quedan fuera del predicado: así una jornada mal cargada se
  -- reemplaza anulándola, sin reescribir su historia.
  if not exists (select 1 from pg_constraint where conname = 'sorteos_jornadas_sin_solape') then
    alter table public.sorteos
      add constraint sorteos_jornadas_sin_solape
      exclude using gist ((tstzrange(ventana_desde, ventana_hasta, '[)')) with &&)
      where (criterio = 'jornada' and estado <> 'anulado')
      deferrable initially immediate;
  end if;
end;
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- 2. El complemento congelado del pool
--
-- `sorteo_pool` congela QUIÉN participó. Nunca hubo nada que congelara quién NO
-- participó, y esa es la pregunta que hace el abogado de quien no ganó: «mi
-- clienta se inscribió el sábado, ¿por qué no está en el pool?».
--
-- Hoy es incontestable, y no por culpa de las jornadas: `elegible` y
-- `email_estado` son MUTABLES —el webhook de Resend mueve `email_estado` en
-- cualquier momento, y `promover_suplente` mueve el rol de un ganador a
-- 'declinado'—, así que reconstruir la pertenencia desde el estado actual da una
-- respuesta distinta cada día. Con esta tabla, ámbito = pool ∪ excluidos, y cada
-- exclusión trae su motivo congelado junto con la decisión.
-- ───────────────────────────────────────────────────────────────────────────

create table if not exists public.sorteo_excluidos (
  sorteo_id      bigint not null references public.sorteos(id),
  inscripcion_id bigint not null references public.inscripciones(id),
  motivo         text   not null
    check (motivo in ('inelegible','email_invalido','ya_premiado')),
  creado_at      timestamptz not null default now(),
  primary key (sorteo_id, inscripcion_id)
);

-- ⚠️ Supabase configura un ALTER DEFAULT PRIVILEGES que concede a anon y a
-- authenticated sobre CADA TABLA nueva de `public`. Una tabla nueva sin este
-- bloque es legible —y escribible— con la clave publicable. Mismo tratamiento
-- que las seis de 20260818120600_rls.sql.
alter table public.sorteo_excluidos enable row level security;
alter table public.sorteo_excluidos force row level security;
revoke all on public.sorteo_excluidos from anon, authenticated;


-- ───────────────────────────────────────────────────────────────────────────
-- 3. La jornada de un instante: UNA sola definición
--
-- La usan el trigger del alta, `crear_inscripcion` y el panel. Tres copias del
-- mismo predicado divergen; una sola no.
--
-- No lleva `security definer` a propósito: se invoca siempre desde dentro de una
-- función que ya lo es, y así hereda el usuario efectivo correcto. Invocada
-- directamente por `authenticated` devolvería null, porque `sorteos` tiene RLS
-- forzada y sin políticas. Para el panel está `jornada_vigente()`, que sí es
-- definer.
--
-- El `order by` con `limit 1` es cinturón y tirantes: la EXCLUDE ya garantiza a
-- lo más una candidata. Se deja para que la función no dependa de que nadie
-- borre la restricción.
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.jornada_en(p_instante timestamptz)
returns bigint
language sql
stable
strict
parallel safe
set search_path = public, pg_temp
as $$
  select s.id
  from public.sorteos s
  where s.criterio = 'jornada'
    and s.estado <> 'anulado'
    and s.ventana_desde <= p_instante
    and s.ventana_hasta >  p_instante
  order by s.ventana_desde
  limit 1
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- 4. Carga de las jornadas desde el calendario
--
-- Idempotente sobre `clave`, y con una excepción que importa: si los valores son
-- idénticos no falla, devuelve 'sin_cambio'. Sin eso, volver a sincronizar el
-- domingo —con la jornada del viernes ya ejecutada— abortaría, y el cargador
-- dejaría de ser reejecutable justo cuando hace falta.
--
-- Lo que ya no está en borrador NO se reescribe: un sorteo ejecutado no puede
-- cambiar de reglas a posteriori.
--
-- La semilla no se toca al actualizar: se registra al crear y se queda ahí. Es
-- la mitad de la reproducibilidad (regla dura 10).
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.cargar_jornadas(
  p_jornadas jsonb,
  p_actor uuid default null
)
returns table (sorteo_id bigint, clave text, accion text)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  j        jsonb;
  v_clave  text;
  v_nombre text;
  v_desde  timestamptz;
  v_hasta  timestamptz;
  v_gan    int;
  v_sup    int;
  v_excl   boolean;
  v_prev   timestamptz := null;
  v_id     bigint;
  v_estado text;
  v_igual  boolean;
  v_accion text;
begin
  if jsonb_typeof(p_jornadas) <> 'array' or jsonb_array_length(p_jornadas) = 0 then
    raise exception 'cargar_jornadas espera un array JSON no vacío.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Ver el comentario de la EXCLUDE: mover el horario completo produce solapes
  -- transitorios entre un UPDATE y el siguiente.
  set constraints sorteos_jornadas_sin_solape deferred;

  for j in
    select value
    from jsonb_array_elements(p_jornadas) with ordinality as t(value, ord)
    order by t.ord
  loop
    v_clave  := j->>'clave';
    v_nombre := j->>'nombre';
    v_desde  := (j->>'desde')::timestamptz;
    v_hasta  := (j->>'hasta')::timestamptz;
    v_gan    := (j->>'n_ganadores')::int;
    v_sup    := (j->>'n_suplentes')::int;
    -- Por defecto SÍ se excluye a quien ya tiene premio: es la decisión del
    -- cliente para esta activación. Se acepta en el payload para que un sorteo
    -- futuro con otras bases pueda cargarse distinto sin tocar esta función.
    v_excl   := coalesce((j->>'excluir_premiados')::boolean, true);

    if v_clave is null or v_nombre is null or v_desde is null or v_hasta is null
       or v_gan is null or v_sup is null then
      raise exception 'Jornada incompleta: %', j
        using errcode = 'invalid_parameter_value';
    end if;
    if v_desde >= v_hasta then
      raise exception 'La jornada % tiene la ventana invertida.', v_clave
        using errcode = 'invalid_parameter_value';
    end if;

    -- Contigüidad estricta. Un HUECO entre dos jornadas no da un error visible
    -- por sí solo: deja al formulario rechazando a todo el mundo durante ese
    -- hueco, con el QR pegado en el mall. Se rechaza acá, donde se ve.
    if v_prev is not null and v_desde <> v_prev then
      raise exception
        'La jornada % empieza en % y la anterior terminó en %: las jornadas tienen que ser contiguas, sin hueco ni solape.',
        v_clave, v_desde, v_prev
        using errcode = 'invalid_parameter_value';
    end if;
    v_prev := v_hasta;

    select s.id, s.estado,
           (s.nombre = v_nombre and s.ventana_desde = v_desde
            and s.ventana_hasta = v_hasta and s.n_ganadores = v_gan
            and s.n_suplentes = v_sup and s.criterio = 'jornada'
            and s.excluir_premiados = v_excl)
      into v_id, v_estado, v_igual
    from public.sorteos s
    where s.clave = v_clave;

    if v_id is null then
      insert into public.sorteos
        (clave, nombre, semilla, criterio, excluir_premiados,
         ventana_desde, ventana_hasta, n_ganadores, n_suplentes)
      values
        (v_clave, v_nombre,
         -- Dos gen_random_uuid() y no gen_random_bytes(): el segundo vive en
         -- pgcrypto, que en Supabase está instalado en el esquema `extensions` y
         -- no resolvería con el search_path fijo de esta función.
         replace(gen_random_uuid()::text, '-', '') ||
         replace(gen_random_uuid()::text, '-', ''),
         'jornada', v_excl, v_desde, v_hasta, v_gan, v_sup)
      returning id into v_id;
      v_accion := 'creada';

    elsif v_igual then
      v_accion := 'sin_cambio';

    elsif v_estado <> 'borrador' then
      raise exception
        'La jornada % está en estado "%": su ventana y sus cupos no se reescriben. Un sorteo ejecutado no puede cambiar de reglas a posteriori.',
        v_clave, v_estado
        using errcode = 'invalid_parameter_value';

    else
      update public.sorteos
      set nombre = v_nombre, criterio = 'jornada', excluir_premiados = v_excl,
          ventana_desde = v_desde, ventana_hasta = v_hasta,
          n_ganadores = v_gan, n_suplentes = v_sup
      where id = v_id;
      v_accion := 'actualizada';
    end if;

    if v_accion <> 'sin_cambio' then
      insert into public.sorteo_auditoria (sorteo_id, evento, detalle, actor)
      values (v_id, 'jornada_' || v_accion,
              jsonb_build_object('clave', v_clave, 'nombre', v_nombre,
                                 'ventana_desde', v_desde, 'ventana_hasta', v_hasta,
                                 'n_ganadores', v_gan, 'n_suplentes', v_sup,
                                 'excluir_premiados', v_excl),
              p_actor);
    end if;

    return query select v_id, v_clave, v_accion;
  end loop;
end;
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- 5. Las tres jornadas confirmadas por el cliente
--
-- Se siembran ACÁ, en la migración, y no solo con el botón del panel. El motivo
-- es de orden y no de comodidad: `sorteo_id` va a ser NOT NULL, así que la fila
-- del sorteo tiene que existir ANTES de la primera inscripción. Si las jornadas
-- se cargaran solo a mano, olvidarse produciría el peor fallo posible —el QR
-- vivo en el mall y el 100% de las altas rechazadas a las 05:00 del viernes— y
-- sería irrecuperable: una inscripción que no se guardó no se recupera.
--
-- Esto convive con la regla de que las fechas viven en variables de entorno: la
-- siembra es la CARGA INICIAL, no la fuente de verdad. Mover las fechas sigue
-- siendo cambiar la variable en Vercel y apretar «Sincronizar» en el panel, sin
-- desplegar SQL. Los valores de acá son exactamente los que produce
-- `lib/concurso.ts` con el calendario cargado, así que esa primera
-- sincronización debería responder 'sin_cambio' en las tres: si responde
-- 'actualizada', el calendario y la base no dicen lo mismo y hay que mirarlo.
--
-- Offset explícito -04:00 y no una fecha local: en agosto Chile está en horario
-- de invierno, y un literal sin offset se correría una hora entera en cuanto pase
-- el cambio de septiembre.
--
--   jornada-1  vie 21  05:00 → 21:00          (16 h: es la jornada corta)
--   jornada-2  vie 21  21:00 → sáb 22  21:00
--   jornada-3  sáb 22  21:00 → dom 23  21:00  ← termina en el último sorteo
--
-- La unión es [vie 05:00, dom 21:00), que tiene que coincidir con
-- CONCURSO_INICIO y CONCURSO_CIERRE.
-- ───────────────────────────────────────────────────────────────────────────

select * from public.cargar_jornadas($json$[
  {"clave":"jornada-1","nombre":"Sorteo del viernes 21 de agosto",
   "desde":"2026-08-21T05:00:00-04:00","hasta":"2026-08-21T21:00:00-04:00",
   "n_ganadores":30,"n_suplentes":10},
  {"clave":"jornada-2","nombre":"Sorteo del sábado 22 de agosto",
   "desde":"2026-08-21T21:00:00-04:00","hasta":"2026-08-22T21:00:00-04:00",
   "n_ganadores":30,"n_suplentes":10},
  {"clave":"jornada-3","nombre":"Sorteo del domingo 23 de agosto",
   "desde":"2026-08-22T21:00:00-04:00","hasta":"2026-08-23T21:00:00-04:00",
   "n_ganadores":30,"n_suplentes":10}
]$json$::jsonb);


-- ───────────────────────────────────────────────────────────────────────────
-- 6. inscripciones.sorteo_id
-- ───────────────────────────────────────────────────────────────────────────

alter table public.inscripciones
  add column if not exists sorteo_id bigint references public.sorteos(id);

comment on column public.inscripciones.sorteo_id is
  'La JORNADA a la que entró esta inscripción, resuelta al insertar contra la '
  'ventana de la fila de sorteos. No es "el sorteo que ganó": eso vive en '
  'sorteo_resultados. Inmutable en la práctica, la escribe el trigger.';

-- Relleno por ventana de cualquier fila de desarrollo previa. Nunca DELETE sobre
-- inscripciones (regla dura 4): si alguna queda fuera de toda jornada se aborta
-- la migración y lo resuelve una persona.
update public.inscripciones i
set sorteo_id = public.jornada_en(i.creado_at)
where i.sorteo_id is null;

do $$
declare v_huerfanas int;
begin
  select count(*) into v_huerfanas
  from public.inscripciones where sorteo_id is null;

  if v_huerfanas > 0 then
    raise exception
      'Hay % inscripciones fuera de toda jornada. No se borran (regla dura 4): amplía la ventana de la jornada que corresponda con cargar_jornadas y vuelve a aplicar.',
      v_huerfanas;
  end if;
end;
$$;

-- En una tabla con datos esto toma ACCESS EXCLUSIVE y la escanea entera. Acá el
-- esquema todavía no está aplicado a ningún proyecto real, así que es
-- instantáneo. Si algún día hubiera que repetirlo sobre datos: NOT VALID y
-- después VALIDATE CONSTRAINT.
alter table public.inscripciones alter column sorteo_id set not null;


-- ───────────────────────────────────────────────────────────────────────────
-- 7. La resolución vive en la BASE, no en la RPC
--
-- El trigger existe por el mismo invariante que hace de `documento_norm` una
-- columna generada: la regla tiene que valer aunque alguien inserte una fila
-- desde el editor SQL de Supabase. Resolver la jornada dentro de
-- `crear_inscripcion` no cumple eso —un INSERT directo elegiría su propia
-- jornada, o la fila entraría al sorteo equivocado— y es la diferencia entre una
-- regla del esquema y una costumbre de la aplicación.
--
-- Pisa `sorteo_id` SIEMPRE, no solo cuando viene null: un valor «sugerido» por
-- quien inserta no es un dato, es una elección de sorteo.
--
-- Lee `new.creado_at` y no `now()`: los DEFAULT de columna se aplican antes de
-- los triggers BEFORE ROW, así que ya está poblado, y así la jornada corresponde
-- al instante REGISTRADO y no al de la transacción.
--
-- Sin `security definer`, igual que `solo_append()`: corre en el contexto de
-- quien inserta. Con `search_path` fijo de todas formas, que es el mismo vector.
--
-- Ojo para quien lo edite: en un trigger BEFORE las columnas GENERATED todavía
-- son null. `new.documento_norm` NO se puede leer acá; hay que llamar a
-- `rut_norm(new.documento)`. Por eso el veto y el duplicado se quedan en
-- `crear_inscripcion`, que tiene el valor crudo.
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.resolver_jornada()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id bigint;
begin
  v_id := public.jornada_en(new.creado_at);

  if v_id is null then
    -- SQLSTATE propio para que crear_inscripcion lo distinga de un
    -- check_violation y devuelva un motivo legible. Clase 'ZJ' porque Postgres
    -- se reserva las que empiezan por 0-4 y A-H.
    raise exception
      'No hay jornada abierta que cubra % (revisa las ventanas con cargar_jornadas).',
      new.creado_at
      using errcode = 'ZJ001';
  end if;

  new.sorteo_id := v_id;
  return new;
end;
$$;

drop trigger if exists inscripciones_resolver_jornada on public.inscripciones;
create trigger inscripciones_resolver_jornada
  before insert on public.inscripciones
  for each row execute function public.resolver_jornada();


-- ───────────────────────────────────────────────────────────────────────────
-- 8. Índices: la unicidad pasa a ser por jornada
--
-- Los originales se crearon como índices y no como constraints, así que
-- DROP INDEX alcanza.
--
-- QUÉ SE PIERDE, con número: el techo por RUT pasa de 1 fila a 3. La asimetría
-- frente a un script que inventara RUT válidos distintos NO cambia —hay millones
-- enumerables y contra eso el índice único nunca protegió—; lo que cambia es la
-- constante. Lo que el índice sí atajaba, el reescaneo accidental del QR, lo
-- sigue atajando al 100%: ocurre en minutos, dentro de la misma jornada. Y el
-- techo sigue siendo duro y de base: nadie pasa de tres.
--
-- `documento_norm` va PRIMERO a propósito: así el índice sirve además como índice
-- de una sola columna para el veto y para la exclusión de premiados, y no hace
-- falta uno extra por haber quitado el global.
-- ───────────────────────────────────────────────────────────────────────────

drop index if exists public.inscripciones_documento_norm_key;
drop index if exists public.inscripciones_email_norm_key;

-- Sin `where elegible`, igual que los globales: quien fue dado de baja por fraude
-- no debe poder reinscribirse el MISMO día con el mismo RUT. Que pudiera hacerlo
-- al día siguiente es una consecuencia inevitable de la unicidad diaria, y por eso
-- crear_inscripcion incorpora abajo una lista de veto.
create unique index if not exists inscripciones_documento_jornada_key
  on public.inscripciones (documento_norm, sorteo_id);

create unique index if not exists inscripciones_email_jornada_key
  on public.inscripciones (email_norm, sorteo_id);

-- Pool por jornada. Parcial por lo mismo que el original: solo se consulta el
-- subconjunto elegible y con correo sano. Con `id` en la clave, armar el pool
-- puede resolverse por index-only scan.
create index if not exists inscripciones_pool_jornada_idx
  on public.inscripciones (sorteo_id, id)
  where elegible and email_estado not in ('rebote','queja');

-- El listado del panel filtrado por jornada. El orden es EXACTAMENTE el del
-- ORDER BY de listar_inscripciones; si se cambia uno hay que cambiar el otro, o
-- Postgres ordena en memoria y el techo de db-max-rows deja de protegernos.
create index if not exists inscripciones_jornada_orden_idx
  on public.inscripciones (sorteo_id, creado_at desc, id desc);

-- inscripciones_pool_idx (creado_at) NO se borra: sigue siendo el índice del
-- criterio 'ventana', el de los sorteos ad-hoc del panel.


-- ───────────────────────────────────────────────────────────────────────────
-- 9. crear_inscripcion
--
-- MISMA FIRMA Y MISMO TIPO DE RETORNO a propósito: así CREATE OR REPLACE conserva
-- los GRANT y no hay riesgo de dejar una sobrecarga que PostgREST no sepa
-- resolver. Cambia el cuerpo, no la puerta.
--
-- Tres cosas nuevas:
--
--   · `sin_jornada`: no hay ventana que cubra este instante. No es culpa de quien
--     se inscribe y no es «cerrado»: es configuración incompleta, y la ruta tiene
--     que dejarlo en el log del servidor en vez de pintarlo como dato inválido.
--
--   · El duplicado se acota A LA JORNADA. Sin el `and sorteo_id`, la rama del
--     unique_violation encuentra la fila de AYER —que es legítima— y reporta
--     'duplicado_rut' aunque lo que chocó fuera el correo.
--
--   · `vetado`: la unicidad global era también la que impedía que alguien dado de
--     baja por fraude volviera a inscribirse. Con unicidad diaria ese invariante
--     se cae solo, y una baja por fraude que caduca en 24 horas no es una baja.
--
-- Se añade además la validación de los textos obligatorios: hoy un p_nombre nulo
-- llega al INSERT, levanta un not_null_violation que la función no captura, y la
-- persona ve un 502 genérico en vez de un mensaje.
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.crear_inscripcion(
  p_nombre text,
  p_email text,
  p_telefono text,
  p_documento text,
  p_declara_edad boolean,
  p_acepta_bases boolean,
  p_acepta_marketing boolean default false,
  p_origen text default 'directo'
)
returns table (
  resultado text,
  inscripcion_id bigint
)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_id      bigint;
  v_jornada bigint;
  v_doc     text;
begin
  -- El cliente ya valida, pero el cliente es evadible (regla dura 3).
  if btrim(coalesce(p_nombre, '')) = ''
     or btrim(coalesce(p_email, '')) = ''
     or coalesce(p_telefono, '') = ''
     or btrim(coalesce(p_documento, '')) = '' then
    return query select 'datos_invalidos'::text, null::bigint;
    return;
  end if;

  if not (p_declara_edad and p_acepta_bases) then
    return query select 'falta_consentimiento'::text, null::bigint;
    return;
  end if;

  if not public.rut_valido(p_documento) then
    return query select 'rut_invalido'::text, null::bigint;
    return;
  end if;

  -- Mismo valor que verá el trigger: now() es constante dentro de la transacción
  -- y creado_at tiene now() por defecto.
  v_jornada := public.jornada_en(now());
  if v_jornada is null then
    return query select 'sin_jornada'::text, null::bigint;
    return;
  end if;

  v_doc := public.rut_norm(p_documento);

  -- Veto: la baja lógica vale para toda la activación, no para el día.
  if exists (
    select 1 from public.inscripciones
    where documento_norm = v_doc
      and not elegible
      and motivo_inelegible is not null
  ) then
    return query select 'vetado'::text, null::bigint;
    return;
  end if;

  begin
    insert into public.inscripciones (
      nombre, email, telefono, documento,
      declara_edad, acepta_bases, acepta_marketing, origen
    )
    values (
      btrim(p_nombre), btrim(p_email), p_telefono, btrim(p_documento),
      p_declara_edad, p_acepta_bases, coalesce(p_acepta_marketing, false),
      coalesce(p_origen, 'directo')
    )
    returning id into v_id;
  exception
    when unique_violation then
      -- Se distingue cuál de las dos claves chocó, DENTRO de esta jornada, para
      -- poder decirle a la persona qué dato ya está registrado hoy.
      if exists (
        select 1 from public.inscripciones
        where documento_norm = v_doc and sorteo_id = v_jornada
      ) then
        return query select 'duplicado_rut'::text, null::bigint;
      else
        return query select 'duplicado_email'::text, null::bigint;
      end if;
      return;
    when sqlstate 'ZJ001' then
      -- Carrera: la jornada se anuló entre la comprobación y el INSERT.
      return query select 'sin_jornada'::text, null::bigint;
      return;
    when check_violation then
      return query select 'datos_invalidos'::text, null::bigint;
      return;
  end;

  -- Encolar, no enviar (regla dura 8).
  insert into public.email_outbox (inscripcion_id, tipo)
  values (v_id, 'confirmacion')
  on conflict on constraint email_outbox_unico do nothing;

  return query select 'creada'::text, v_id;
end;
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- 10. ejecutar_sorteo
--
-- Cambia de firma (gana `p_forzar`) y de tipo de retorno (gana `excluidos`), así
-- que va DROP + CREATE: CREATE OR REPLACE no puede cambiar el tipo de retorno, y
-- añadir un parámetro con DEFAULT crearía una SOBRECARGA en vez de reemplazar
-- —quedarían las dos y PostgREST podría no resolver la llamada—.
--
-- Cuatro cambios de fondo:
--
--   1. El pool sale de `sorteo_id` cuando criterio='jornada'. La ventana sigue
--      valiendo para los sorteos ad-hoc: esta migración es aditiva también en
--      comportamiento, no solo en DDL.
--
--   2. Se congela el COMPLEMENTO en sorteo_excluidos, con su motivo.
--
--   3. Se niega a ejecutar ANTES de que cierre la ventana. Ejecutar a las 20:55
--      deja fuera a gente que todavía está en plazo y que las bases admiten, y el
--      sorteo no se deshace. `p_forzar` existe para el caso operativo real —hay
--      que cortar de urgencia— y queda en la auditoría, que es la diferencia
--      entre una decisión y un accidente.
--
--   4. Con la exclusión de premiados encendida, los sorteos dejan de ser
--      independientes: el resultado del sábado depende de que el viernes ya se
--      haya hecho. Ejecutar el domingo antes que el sábado daría un reparto
--      distinto y no se puede deshacer, así que se exige el orden.
--
-- verificar_sorteo NO se toca. Reproduce el ORDEN dentro del pool congelado a
-- partir de la semilla, y eso es independiente del predicado que eligió la
-- pertenencia: cambiar la ventana por sorteo_id no altera su garantía en nada.
-- Lo que sí faltaba —verificar QUIÉNES— es verificar_membresia, más abajo.
-- ───────────────────────────────────────────────────────────────────────────

drop function if exists public.ejecutar_sorteo(bigint, uuid);

create or replace function public.ejecutar_sorteo(
  p_sorteo_id bigint,
  p_actor uuid default null,
  p_forzar boolean default false
)
returns table (
  sorteo_id  bigint,
  en_pool    int,
  excluidos  int,
  ganadores  int,
  suplentes  int
)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  s public.sorteos%rowtype;
  v_pool int;
  v_exc  int;
  v_gan  int;
  v_sup  int;
  v_previa text;
begin
  -- Reclamo atómico. Si otra transacción ya lo tomó, o el sorteo no está en
  -- borrador, acá se termina. `estado` no es columna de clave, así que este
  -- UPDATE toma FOR NO KEY UPDATE y no choca con los FOR KEY SHARE que cada alta
  -- toma sobre esta misma fila por la clave ajena.
  update public.sorteos
  set estado = 'ejecutando'
  where id = p_sorteo_id and estado = 'borrador'
  returning * into s;

  if not found then
    raise exception 'El sorteo % no está en borrador (ya se ejecutó, se está ejecutando o no existe).', p_sorteo_id
      using errcode = 'invalid_parameter_value';
  end if;

  -- Las excepciones de acá abajo abortan la función entera, así que el reclamo se
  -- revierte y el sorteo vuelve a 'borrador'. Parece un estado colgado y no lo es.

  if s.criterio = 'jornada' and not coalesce(p_forzar, false)
     and now() < s.ventana_hasta then
    raise exception
      'La jornada "%" cierra a las % y todavía no son. Ejecutar antes deja fuera a quien está en plazo; si hay que cortar de todas formas, usa p_forzar y quedará registrado.',
      s.nombre, s.ventana_hasta
      using errcode = 'invalid_parameter_value';
  end if;

  if s.excluir_premiados and s.criterio = 'jornada' then
    select sp.nombre into v_previa
    from public.sorteos sp
    where sp.criterio = 'jornada'
      and sp.estado = 'borrador'
      and sp.ventana_desde < s.ventana_desde
    order by sp.ventana_desde
    limit 1;

    if v_previa is not null and not coalesce(p_forzar, false) then
      raise exception
        'La jornada "%" todavía no se ha ejecutado. Con un premio por persona, el reparto de este sorteo depende de quién ganó antes: ejecútalas en orden.',
        v_previa
        using errcode = 'invalid_parameter_value';
    end if;
  end if;

  -- ── Complemento congelado ─────────────────────────────────────────────────
  -- El CASE sobre el criterio impide usar el índice, y es deliberado: esta
  -- consulta corre tres veces en toda la activación, y tener UN predicado del
  -- ámbito en vez de dos copias vale más que el scan.
  insert into public.sorteo_excluidos (sorteo_id, inscripcion_id, motivo)
  select s.id, i.id,
         case when not i.elegible                       then 'inelegible'
              when i.email_estado in ('rebote','queja')  then 'email_invalido'
              else 'ya_premiado' end
  from public.inscripciones i
  where (case when s.criterio = 'jornada'
              then i.sorteo_id = s.id
              else (s.ventana_desde is null or i.creado_at >= s.ventana_desde)
               and (s.ventana_hasta is null or i.creado_at <  s.ventana_hasta)
         end)
    and (
      not i.elegible
      or i.email_estado in ('rebote','queja')
      or (s.excluir_premiados and exists (
            -- Se cruza por RUT y no por correo: el RUT es la identidad con la que
            -- se entrega el premio. Cruzar también por correo excluiría a quien
            -- compartió la dirección con un familiar que ganó.
            select 1
            from public.inscripciones otra
            join public.sorteo_resultados r on r.inscripcion_id = otra.id
            where otra.documento_norm = i.documento_norm
              and r.sorteo_id <> s.id
              and r.rol in ('ganador','promovido')
          ))
    )
  on conflict do nothing;

  get diagnostics v_exc = row_count;

  -- ── Pool congelado ────────────────────────────────────────────────────────
  -- Regla dura 10: el orden lo decide md5(semilla || id) con desempate por id.
  -- Prohibido setseed() + random(), que deja de ser determinista en cuanto el
  -- planificador paraleliza el scan.
  insert into public.sorteo_pool (sorteo_id, inscripcion_id, orden)
  select s.id,
         i.id,
         row_number() over (order by md5(s.semilla || i.id::text), i.id)
  from public.inscripciones i
  where (case when s.criterio = 'jornada'
              then i.sorteo_id = s.id
              else (s.ventana_desde is null or i.creado_at >= s.ventana_desde)
               and (s.ventana_hasta is null or i.creado_at <  s.ventana_hasta)
         end)
    and not exists (
      select 1 from public.sorteo_excluidos e
      where e.sorteo_id = s.id and e.inscripcion_id = i.id
    );

  get diagnostics v_pool = row_count;

  if v_pool = 0 then
    raise exception 'El sorteo % no tiene participantes elegibles en su ámbito.', p_sorteo_id
      using errcode = 'invalid_parameter_value';
  end if;

  -- Si el pool es más chico que ganadores + suplentes, se reparte lo que hay: un
  -- pool corto es un dato del negocio, no un error del programa.
  insert into public.sorteo_resultados (sorteo_id, inscripcion_id, posicion, rol)
  select p.sorteo_id, p.inscripcion_id, p.orden,
         case when p.orden <= s.n_ganadores then 'ganador' else 'suplente' end
  from public.sorteo_pool p
  where p.sorteo_id = s.id
    and p.orden <= s.n_ganadores + s.n_suplentes;

  select count(*) filter (where rol = 'ganador'),
         count(*) filter (where rol = 'suplente')
  into v_gan, v_sup
  from public.sorteo_resultados
  where sorteo_resultados.sorteo_id = s.id;

  -- Encolar, no enviar (regla dura 8). El índice único de la cola hace que un
  -- reintento no duplique nada.
  insert into public.email_outbox (inscripcion_id, tipo)
  select r.inscripcion_id, r.rol
  from public.sorteo_resultados r
  where r.sorteo_id = s.id and r.rol in ('ganador','suplente')
  on conflict on constraint email_outbox_unico do nothing;

  update public.sorteos
  set estado = 'ejecutado', ejecutado_at = now(), ejecutado_por = p_actor
  where id = s.id;

  insert into public.sorteo_auditoria (sorteo_id, evento, detalle, actor)
  values (s.id, 'ejecutado',
          jsonb_build_object(
            'clave', s.clave,
            'criterio', s.criterio,
            'excluir_premiados', s.excluir_premiados,
            'forzado', coalesce(p_forzar, false),
            'en_pool', v_pool,
            'excluidos', v_exc,
            'ganadores', v_gan,
            'suplentes', v_sup,
            'ventana_desde', s.ventana_desde,
            'ventana_hasta', s.ventana_hasta
          ),
          p_actor);

  return query select s.id, v_pool, v_exc::int, v_gan::int, v_sup::int;
end;
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- 11. verificar_membresia
--
-- La contraparte que faltaba de verificar_sorteo. Aquella comprueba el ORDEN;
-- esta comprueba QUIÉNES: toda inscripción del ámbito que existía al ejecutar
-- está o en el pool o en excluidos. El recorte por `ejecutado_at` es lo que evita
-- que una inscripción posterior —la que llega a las 21:04 y ya pertenece a la
-- jornada siguiente, o la que entró mientras se ejecutaba— la haga fallar sin
-- motivo.
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.verificar_membresia(p_sorteo_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select not exists (
    select 1
    from public.sorteos s
    join public.inscripciones i on i.sorteo_id = s.id
    where s.id = p_sorteo_id
      and s.criterio = 'jornada'
      and s.ejecutado_at is not null
      and i.creado_at <= s.ejecutado_at
      and not exists (select 1 from public.sorteo_pool p
                      where p.sorteo_id = s.id and p.inscripcion_id = i.id)
      and not exists (select 1 from public.sorteo_excluidos e
                      where e.sorteo_id = s.id and e.inscripcion_id = i.id)
  )
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- 12. promover_suplente
--
-- Misma firma, así que CREATE OR REPLACE conserva los GRANT.
--
-- Excluir premiados del POOL no alcanza, y es justo acá donde se escapaba el
-- premio doble: alguien que quedó suplente el sábado y ganó el domingo puede ser
-- promovido el lunes y terminar con dos premios. La regla tiene que estar en los
-- dos sitios o en ninguno.
--
-- Se busca al suplente con un NOT EXISTS y no con un JOIN para no arrastrar
-- `inscripciones` al FOR UPDATE.
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.promover_suplente(
  p_resultado_id bigint,
  p_motivo text default null,
  p_actor uuid default null
)
returns table (
  declinado_id bigint,
  promovido_id bigint
)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  g  public.sorteo_resultados%rowtype;
  su public.sorteo_resultados%rowtype;
  v_excluir boolean;
begin
  select * into g
  from public.sorteo_resultados
  where id = p_resultado_id
  for update;

  if not found then
    raise exception 'No existe el resultado %.', p_resultado_id
      using errcode = 'invalid_parameter_value';
  end if;

  if g.rol <> 'ganador' then
    raise exception 'El resultado % no es un ganador vigente (rol actual: %).', p_resultado_id, g.rol
      using errcode = 'invalid_parameter_value';
  end if;

  select excluir_premiados into v_excluir
  from public.sorteos where id = g.sorteo_id;

  -- Sin el `for update skip locked`, dos promociones simultáneas ascendían al
  -- MISMO suplente y dejaban un premio sin dueño.
  select * into su
  from public.sorteo_resultados r
  where r.sorteo_id = g.sorteo_id
    and r.rol = 'suplente'
    and (
      not v_excluir
      or not exists (
        select 1
        from public.inscripciones mia
        join public.inscripciones otra on otra.documento_norm = mia.documento_norm
        join public.sorteo_resultados pr on pr.inscripcion_id = otra.id
        where mia.id = r.inscripcion_id
          and pr.sorteo_id <> r.sorteo_id
          and pr.rol in ('ganador','promovido')
      )
    )
  order by r.posicion
  limit 1
  for update skip locked;

  if not found then
    raise exception 'El sorteo % no tiene suplentes disponibles%.', g.sorteo_id,
      case when v_excluir then ' que no tengan ya premio en otra jornada' else '' end
      using errcode = 'invalid_parameter_value';
  end if;

  update public.sorteo_resultados
  set rol = 'declinado', motivo = p_motivo, cambiado_at = now()
  where id = g.id;

  update public.sorteo_resultados
  set rol = 'promovido', promovido_desde = g.id, cambiado_at = now()
  where id = su.id;

  insert into public.email_outbox (inscripcion_id, tipo)
  values (su.inscripcion_id, 'promovido')
  on conflict on constraint email_outbox_unico do nothing;

  insert into public.sorteo_auditoria (sorteo_id, evento, detalle, actor)
  values (g.sorteo_id, 'promocion',
          jsonb_build_object(
            'declinado_resultado', g.id,
            'declinado_posicion', g.posicion,
            'promovido_resultado', su.id,
            'promovido_posicion', su.posicion,
            'excluyo_premiados', v_excluir,
            'motivo', p_motivo
          ),
          p_actor);

  return query select g.id, su.id;
end;
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- 13. registrar_evento_email: el rebote es de la DIRECCIÓN, no de la fila
--
-- Con una inscripción por persona esto daba igual. Con tres, el ciclo se rompe:
-- el webhook marca SOLO la fila cuyo correo salió, así que una dirección que
-- rebotó el viernes sigue en el pool del sábado y del domingo, y puede ganar un
-- premio que nadie va a poder notificar. Es exactamente el fallo que este ciclo
-- existe para evitar, multiplicado por tres.
--
-- Se propaga por `email_norm` y solo para rebote y queja. Y no se DEGRADA: un
-- 'delivered' que llega tarde ya no borra un rebote anterior.
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.registrar_evento_email(
  p_proveedor_id text,
  p_evento text
)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_inscripcion bigint;
  v_estado text;
  v_email  text;
begin
  v_estado := case p_evento
    when 'delivered'  then 'entregado'
    when 'bounced'    then 'rebote'
    when 'complained' then 'queja'
    else null
  end;
  if v_estado is null then
    return;
  end if;

  select inscripcion_id into v_inscripcion
  from public.email_outbox
  where proveedor_id = p_proveedor_id;

  if v_inscripcion is null then
    return;
  end if;

  select email_norm into v_email
  from public.inscripciones where id = v_inscripcion;

  update public.inscripciones
  set email_estado = v_estado
  where email_estado not in ('rebote','queja')
    and (
      id = v_inscripcion
      or (v_estado in ('rebote','queja') and email_norm = v_email)
    );
end;
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- 14. tomar_lote_email: la cola necesita saber cuándo se sortea
--
-- El correo de confirmación dice a qué sorteo entró la persona, y ese dato tiene
-- que salir de la BASE y no del calendario del proceso que drena la cola: el cron
-- compone un correo para una fila que se escribió antes, y recalcular la jornada
-- con el reloj de ahora daría la jornada equivocada para todo lo que quedó en la
-- cola cuando pasan las 21:00.
--
-- Se devuelve el instante del sorteo —el `ventana_hasta` de la jornada— y no la
-- fecha suelta, para que el formateo en la zona de Chile lo haga una sola pieza:
-- lib/concurso.ts.
--
-- Cambia el tipo de retorno, así que DROP + CREATE. No se concede a nadie: corre
-- solo bajo service role.
-- ───────────────────────────────────────────────────────────────────────────

drop function if exists public.tomar_lote_email(int);

create or replace function public.tomar_lote_email(lote int default 100)
returns table (
  id bigint,
  inscripcion_id bigint,
  tipo text,
  intentos int,
  nombre text,
  email text,
  sorteo_at timestamptz
)
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  with tomadas as (
    select o.id
    from public.email_outbox o
    where o.estado in ('pendiente', 'error')
      and o.disponible_at <= now()
    order by o.disponible_at, o.id
    limit least(greatest(lote, 1), 500)
    for update skip locked
  ),
  marcadas as (
    update public.email_outbox o
    set estado = 'enviando',
        intentos = o.intentos + 1,
        tomado_at = now()
    from tomadas t
    where o.id = t.id
    returning o.id, o.inscripcion_id, o.tipo, o.intentos
  )
  select m.id, m.inscripcion_id, m.tipo, m.intentos, i.nombre, i.email,
         s.ventana_hasta
  from marcadas m
  join public.inscripciones i on i.id = m.inscripcion_id
  -- LEFT JOIN: un sorteo ad-hoc sin ventana no tiene instante de sorteo, y la
  -- plantilla omite la línea en vez de fallar.
  left join public.sorteos s on s.id = i.sorteo_id and s.criterio = 'jornada'
  order by m.id
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- 15. Lecturas del panel
--
-- Las tres primeras cambian de tipo de retorno, así que van DROP + CREATE y hay
-- que reconceder EXECUTE. Sin el DROP quedarían dos versiones y la llamada por
-- nombre de parámetro de PostgREST podría volverse ambigua.
-- ───────────────────────────────────────────────────────────────────────────

drop function if exists public.listar_inscripciones(text, text, boolean, timestamptz, bigint, int);

create or replace function public.listar_inscripciones(
  p_buscar text default null,
  p_origen text default null,
  p_solo_elegibles boolean default null,
  p_cursor_creado_at timestamptz default null,
  p_cursor_id bigint default null,
  p_limite int default 50,
  p_sorteo_id bigint default null
)
returns table (
  id bigint,
  creado_at timestamptz,
  nombre text,
  email text,
  telefono text,
  documento text,
  origen text,
  elegible boolean,
  email_estado text,
  acepta_marketing boolean,
  sorteo_id bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select i.id, i.creado_at, i.nombre, i.email, i.telefono, i.documento,
         i.origen, i.elegible, i.email_estado, i.acepta_marketing, i.sorteo_id
  from public.inscripciones i
  where
    -- El % y el _ del término se escapan: sin eso, buscar "100%" devuelve la
    -- tabla entera y el índice no sirve de nada.
    (p_buscar is null or btrim(p_buscar) = '' or i.busqueda like
      '%' || replace(replace(replace(
        public.inmutable_unaccent(lower(btrim(p_buscar))),
        '\', '\\'), '%', '\%'), '_', '\_') || '%')
    and (p_origen is null or i.origen = p_origen)
    and (p_solo_elegibles is null or i.elegible = p_solo_elegibles)
    and (p_sorteo_id is null or i.sorteo_id = p_sorteo_id)
    and (p_cursor_creado_at is null or p_cursor_id is null
         or (i.creado_at, i.id) < (p_cursor_creado_at, p_cursor_id))
  order by i.creado_at desc, i.id desc
  -- Techo duro: ningún parámetro del cliente puede pedir la tabla entera.
  limit least(greatest(coalesce(p_limite, 50), 1), 200)
$$;

drop function if exists public.listar_sorteos();

create or replace function public.listar_sorteos()
returns table (
  id bigint,
  clave text,
  nombre text,
  estado text,
  criterio text,
  excluir_premiados boolean,
  ventana_desde timestamptz,
  ventana_hasta timestamptz,
  n_ganadores int,
  n_suplentes int,
  creado_at timestamptz,
  ejecutado_at timestamptz,
  inscritos bigint,
  en_pool bigint,
  excluidos bigint,
  ganadores_vigentes bigint,
  suplentes_vigentes bigint,
  reproduce boolean,
  membresia_completa boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.id, s.clave, s.nombre, s.estado, s.criterio, s.excluir_premiados,
         s.ventana_desde, s.ventana_hasta, s.n_ganadores, s.n_suplentes,
         s.creado_at, s.ejecutado_at,
         -- Cuánta gente lleva la jornada. Es la cifra que el equipo mira antes de
         -- las 21:00, y hasta ahora no existía en ninguna pantalla.
         (select count(*) from public.inscripciones i where i.sorteo_id = s.id),
         (select count(*) from public.sorteo_pool p where p.sorteo_id = s.id),
         (select count(*) from public.sorteo_excluidos e where e.sorteo_id = s.id),
         (select count(*) from public.sorteo_resultados r
           where r.sorteo_id = s.id and r.rol in ('ganador','promovido')),
         (select count(*) from public.sorteo_resultados r
           where r.sorteo_id = s.id and r.rol = 'suplente'),
         -- Se recalcula el orden desde la semilla en cada consulta del panel: si
         -- algún día deja de reproducir, hay que verlo en la pantalla donde se
         -- publica el resultado, no en una auditoría seis meses después.
         case when s.estado = 'ejecutado' then public.verificar_sorteo(s.id) end,
         case when s.estado = 'ejecutado' then public.verificar_membresia(s.id) end
  from public.sorteos s
  -- Las jornadas primero y en orden de calendario: son las tres filas que el
  -- equipo mira. Los sorteos ad-hoc quedan debajo, del más nuevo al más viejo.
  order by (s.criterio = 'jornada') desc, s.ventana_desde, s.id desc
  limit 100
$$;

-- resumen_inscripciones cambia de retorno: con tres jornadas, `total` pasa a
-- contar INSCRIPCIONES y no personas, y el equipo leería un número hasta tres
-- veces mayor sin saber por qué. `personas` es la cifra comparable con la de una
-- activación de un solo sorteo.
drop function if exists public.resumen_inscripciones();

create or replace function public.resumen_inscripciones()
returns table (
  total bigint,
  personas bigint,
  elegibles bigint,
  con_marketing bigint,
  rebotes bigint,
  quejas bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*),
         count(distinct documento_norm),
         count(*) filter (where elegible),
         count(*) filter (where acepta_marketing),
         count(*) filter (where email_estado = 'rebote'),
         count(*) filter (where email_estado = 'queja')
  from public.inscripciones
$$;

/**
 * Estado de las jornadas para el panel. Dentro de una jornada `documento_norm` es
 * único por índice, así que `inscritos` YA es el número de personas de ese día: no
 * hace falta un count(distinct) por jornada.
 */
create or replace function public.resumen_jornadas()
returns table (
  sorteo_id bigint,
  clave text,
  nombre text,
  estado text,
  ventana_desde timestamptz,
  ventana_hasta timestamptz,
  inscritos bigint,
  vigente boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.id, s.clave, s.nombre, s.estado, s.ventana_desde, s.ventana_hasta,
         (select count(*) from public.inscripciones i where i.sorteo_id = s.id),
         s.ventana_desde <= now() and s.ventana_hasta > now()
  from public.sorteos s
  where s.criterio = 'jornada' and s.estado <> 'anulado'
  order by s.ventana_desde
$$;

/**
 * La jornada abierta ahora mismo, o cero filas. El panel lo pinta como aviso
 * cuando no hay ninguna: es la única forma de enterarse de que el formulario está
 * rechazando altas ANTES de que lo cuente alguien desde el mall.
 */
create or replace function public.jornada_vigente()
returns table (sorteo_id bigint, clave text, nombre text, ventana_hasta timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.id, s.clave, s.nombre, s.ventana_hasta
  from public.sorteos s
  where s.id = public.jornada_en(now())
$$;

/**
 * Personas con premio en más de un sorteo. Con la exclusión encendida —que es la
 * decisión de esta activación— cualquier fila acá es un fallo que hay que mirar
 * ANTES de entregar los premios.
 */
create or replace function public.premiados_duplicados()
returns table (documento_norm text, premios bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select i.documento_norm, count(*)
  from public.sorteo_resultados r
  join public.inscripciones i on i.id = r.inscripcion_id
  where r.rol in ('ganador','promovido')
  group by i.documento_norm
  having count(*) > 1
  order by count(*) desc
  limit 200
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- 16. Permisos: barrido final
--
-- ⚠️ LA TRAMPA DE SUPABASE SIGUE ARMADA, y esta migración crea nueve funciones
-- nuevas. El `alter default privileges ... revoke execute from public` de
-- 20260818120600 solo neutralizó el permiso de PUBLIC; el ALTER DEFAULT
-- PRIVILEGES de Supabase concede EXECUTE a anon, authenticated y service_role
-- sobre cada función nueva de `public`, y ese es un permiso PROPIO de cada rol que
-- revocárselo a PUBLIC no toca. Ya se detectó una vez en producción con
-- listar_sorteos respondiendo 200 a la clave anónima.
--
-- Se revoca a los tres roles y se devuelve, una por una, lo permitido. Enumerar lo
-- permitido es la única forma que no se rompe cuando alguien agregue la próxima
-- función.
--
-- Y se cierra la trampa para el futuro: revocando también en los DEFAULT
-- PRIVILEGES para anon y authenticated, la próxima migración que agregue una RPC
-- ya no la deja invocable con la clave anónima.
-- ───────────────────────────────────────────────────────────────────────────

revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated;

-- Únicas puertas públicas: el alta del formulario y el booleano del interruptor.
grant execute on function public.crear_inscripcion(
  text, text, text, text, boolean, boolean, boolean, text
) to anon, authenticated;
grant execute on function public.estado_inscripciones() to anon, authenticated;

-- Panel. `authenticated` acá es el equipo: este proyecto no tiene cuentas de
-- usuario público.
grant execute on function public.listar_inscripciones(
  text, text, boolean, timestamptz, bigint, int, bigint
) to authenticated;
grant execute on function public.listar_sorteos()                        to authenticated;
grant execute on function public.listar_resultados(bigint)               to authenticated;
grant execute on function public.resumen_inscripciones()                 to authenticated;
grant execute on function public.resumen_por_panel()                     to authenticated;
grant execute on function public.resumen_jornadas()                      to authenticated;
grant execute on function public.jornada_vigente()                       to authenticated;
grant execute on function public.premiados_duplicados()                  to authenticated;
grant execute on function public.marcar_inelegible(bigint, text)         to authenticated;
grant execute on function public.crear_sorteo(text, int, int, timestamptz, timestamptz) to authenticated;
grant execute on function public.cargar_jornadas(jsonb, uuid)            to authenticated;
grant execute on function public.ejecutar_sorteo(bigint, uuid, boolean)  to authenticated;
grant execute on function public.promover_suplente(bigint, text, uuid)   to authenticated;
grant execute on function public.verificar_sorteo(bigint)                to authenticated;
grant execute on function public.verificar_membresia(bigint)             to authenticated;
grant execute on function public.set_inscripciones(boolean, uuid)        to authenticated;

-- Sin conceder a propósito, para que el revoke de arriba no se lea como un olvido:
--   · El drenaje de la cola y el webhook corren con el service role, que salta RLS:
--     tomar_lote_email, marcar_email_enviado, marcar_email_error,
--     rescatar_emails_colgados, registrar_evento_email.
--   · jornada_en y resolver_jornada son internas. jornada_en no es `security
--     definer` a propósito, así que invocada por `authenticated` devolvería null:
--     el panel usa jornada_vigente().

-- PostgREST cachea la firma de las funciones. Supabase suele recargar por event
-- trigger, pero con cinco DROP + CREATE conviene forzarlo.
notify pgrst, 'reload schema';
