-- ═══════════════════════════════════════════════════════════════════════════
-- Modo pruebas: ensayar en producción y no dejar rastro.
--
-- Hasta acá el sistema no se podía probar contra la base real sin ensuciarla:
--
--   · el calendario dice «antes» hasta el viernes a las 05:00, así que el alta
--     responde 409;
--   · aunque se abriera el interruptor manual, ninguna jornada cubre HOY y
--     `crear_inscripcion` devolvería `sin_jornada`, porque `sorteo_id` es
--     not null y lo resuelve un trigger contra las ventanas cargadas;
--   · y la unicidad por jornada deja una sola inscripción por RUT y por día,
--     así que ni siquiera se puede repetir el flujo dos veces seguidas.
--
-- Esta migración añade las tres piezas que faltan y —lo más importante— la
-- garantía de que nada de lo que se pruebe puede contaminar un sorteo real ni
-- quedarse pegado en las cifras del panel.
--
-- ── El invariante ───────────────────────────────────────────────────────────
--
--   Un dato de prueba NUNCA entra al pool de un sorteo real, NUNCA cuenta en
--   las cifras del panel y SIEMPRE se puede borrar entero.
--
-- Se sostiene con una sola columna, `inscripciones.es_prueba`, que escribe el
-- mismo trigger que resuelve la jornada. No es un filtro de la aplicación: vale
-- también para una fila insertada desde el editor SQL de Supabase, igual que
-- `documento_norm` o `sorteo_id`.
--
-- ── Dos excepciones a reglas duras, escritas acá y no descubiertas después ──
--
--   Regla 4 (nunca DELETE sobre inscripciones). `purgar_pruebas` borra, y esa
--   es toda su razón de existir. La regla protege la trazabilidad de quien
--   participó de verdad; una fila de prueba no tiene nada que trazar, y dejarla
--   sí hace daño: infla el total, entra a los recuentos por panel y obliga a
--   explicar en una fiscalización por qué el mismo RUT aparece cuarenta veces.
--   El borrado está acotado en el SQL —solo filas con `es_prueba`, y solo si su
--   sorteo no está ejecutado—, no en la disciplina de quien escriba la consulta.
--
--   Auditoría append-only. `solo_append` sigue prohibiendo todo UPDATE y todo
--   DELETE, salvo el DELETE de la auditoría de un sorteo marcado como prueba.
--   La alternativa era desactivar el trigger a mano para limpiar, que es peor:
--   deja la tabla sin protección para TODAS las transacciones mientras dure, y
--   depende de acordarse de volver a encenderlo.
--
-- ── Lo que NO hace ──────────────────────────────────────────────────────────
--
-- No baja la RLS de ninguna tabla. La RLS de este proyecto es forzada y sin
-- políticas a propósito, y bajarla para poder limpiar cambiaría el modelo de
-- seguridad entero por una tarea de dos minutos. El borrado entra por una RPC
-- `security definer` concedida solo a `authenticated`, que es la misma puerta
-- estrecha por la que ya pasa todo lo demás.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- 1. Las identidades de prueba
--
-- Una tabla y no una constante en el SQL: la dirección del equipo cambia, se
-- suma alguien más, y cada cambio no debería costar una migración. Los valores
-- se guardan YA NORMALIZADOS —`rut_norm` y `email_norm`— porque la comparación
-- se hace contra las mismas funciones que producen `documento_norm` y
-- `email_norm`; guardarlos crudos obligaría a normalizar en cada lectura y a
-- que las dos normalizaciones no se desincronizaran nunca.
-- ───────────────────────────────────────────────────────────────────────────

create table if not exists public.identidades_prueba (
  clase     text not null check (clase in ('rut','email')),
  valor     text not null,
  nota      text,
  creado_at timestamptz not null default now(),
  primary key (clase, valor)
);

comment on table public.identidades_prueba is
  'RUT y correos del equipo que pueden inscribirse sin límite. Sus filas quedan '
  'marcadas es_prueba: fuera de todo pool real y borrables con purgar_pruebas.';

-- ⚠️ Supabase concede a anon y a authenticated sobre CADA tabla nueva de
-- `public` por su ALTER DEFAULT PRIVILEGES. Sin este bloque, la lista de
-- identidades de prueba sería legible —y escribible— con la clave publicable.
alter table public.identidades_prueba enable row level security;
alter table public.identidades_prueba force row level security;
revoke all on public.identidades_prueba from anon, authenticated;

insert into public.identidades_prueba (clase, valor, nota) values
  ('rut',   '111111111',                  'RUT de pruebas del equipo (11.111.111-1)'),
  ('email', 'antonio.capra@agenciavs.cl', 'Correo de pruebas del equipo')
on conflict (clase, valor) do nothing;


-- ───────────────────────────────────────────────────────────────────────────
-- 2. Sorteos de prueba
--
-- Una jornada de prueba es una fila de `sorteos` normal y corriente con esta
-- marca. Que sea una columna y no una convención sobre `clave` importa: de acá
-- cuelgan tres comportamientos —el pool incluye las filas de prueba, la
-- ejecución no espera al cierre de la ventana, la auditoría se puede borrar— y
-- ninguno debería depender de que nadie renombre una clave.
-- ───────────────────────────────────────────────────────────────────────────

alter table public.sorteos
  add column if not exists es_prueba boolean not null default false;

comment on column public.sorteos.es_prueba is
  'Sorteo de ensayo. No bloquea el orden de ejecución de las jornadas reales, '
  'se puede ejecutar con la ventana abierta y purgar_pruebas lo borra entero.';


-- ───────────────────────────────────────────────────────────────────────────
-- 3. Inscripciones de prueba
--
-- Dos columnas y no una, porque son dos preguntas distintas y se responden en
-- momentos distintos:
--
--   · `identidad_prueba` — el RUT o el correo están en la lista fija. Es lo que
--     exime de la unicidad diaria, y por eso tiene que ser una columna: un
--     índice único parcial necesita un predicado sobre la propia fila, no una
--     consulta a otra tabla.
--
--   · `es_prueba` — la fila es dato de prueba. Es `identidad_prueba` O que la
--     jornada donde cayó sea una jornada de prueba. Esto último es lo que hace
--     que TODO lo que entre por la ventana de ensayo sea borrable, incluida el
--     alta que haga alguien de paso mientras el modo está encendido.
--
-- Colapsarlas en una sola tenía un costo concreto: si la exención de unicidad
-- se aplicara a toda la ventana de pruebas, dejaría de poder probarse el
-- mensaje de «ya estás inscrito», que es justamente uno de los caminos que hay
-- que ver funcionando antes del viernes.
-- ───────────────────────────────────────────────────────────────────────────

alter table public.inscripciones
  add column if not exists identidad_prueba boolean not null default false;

alter table public.inscripciones
  add column if not exists es_prueba boolean not null default false;

comment on column public.inscripciones.identidad_prueba is
  'El RUT o el correo están en identidades_prueba. Exime de la unicidad por '
  'jornada: la escribe el trigger, no la aplicación.';

comment on column public.inscripciones.es_prueba is
  'Dato de prueba: identidad de prueba, o jornada de prueba. Fuera del pool de '
  'todo sorteo real, fuera de las cifras del panel y borrable con purgar_pruebas.';

-- El pool real las salta por índice en vez de por scan. Parcial y diminuto: en
-- la activación entera serán unas decenas de filas.
create index if not exists inscripciones_prueba_idx
  on public.inscripciones (sorteo_id, id)
  where es_prueba;


-- ───────────────────────────────────────────────────────────────────────────
-- 4. resolver_jornada, que ahora resuelve también las dos marcas
--
-- Van en el MISMO trigger y no en uno nuevo por una razón de orden: `es_prueba`
-- depende de la jornada resuelta, y dos triggers BEFORE sobre la misma tabla se
-- ordenan por nombre, que es una dependencia invisible y frágil. Con una sola
-- función el orden lo impone la secuencia de las líneas.
--
-- Pisa las dos columnas SIEMPRE, igual que `sorteo_id`: un valor «sugerido» por
-- quien inserta no es un dato, es la elección de si algo cuenta o no cuenta.
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.resolver_jornada()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id     bigint;
  v_ensayo boolean;
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

  -- Ojo para quien lo edite: en un trigger BEFORE las columnas GENERATED
  -- todavía son null. `new.documento_norm` NO se puede leer acá; hay que llamar
  -- a `rut_norm(new.documento)`, que es exactamente lo que ese generado hará.
  new.identidad_prueba := exists (
    select 1
    from public.identidades_prueba p
    where (p.clase = 'rut'   and p.valor = public.rut_norm(new.documento))
       or (p.clase = 'email' and p.valor = public.email_norm(new.email))
  );

  select s.es_prueba into v_ensayo from public.sorteos s where s.id = v_id;

  new.es_prueba := new.identidad_prueba or coalesce(v_ensayo, false);

  return new;
end;
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- 5. La unicidad por jornada exime a las identidades de prueba
--
-- Índices parciales: la regla «un RUT y un correo por jornada» sigue siendo
-- exactamente la misma para todo el mundo, y las filas del equipo simplemente
-- no participan de ella.
--
-- Lo que se pierde: nada del lado real. Lo que se gana: poder recorrer el flujo
-- completo veinte veces seguidas sin inventar RUT válidos —que además
-- ensuciarían la base con identidades que no son de nadie y que después habría
-- que distinguir a ojo de las de verdad—.
-- ───────────────────────────────────────────────────────────────────────────

drop index if exists public.inscripciones_documento_jornada_key;
drop index if exists public.inscripciones_email_jornada_key;

create unique index if not exists inscripciones_documento_jornada_key
  on public.inscripciones (documento_norm, sorteo_id)
  where not identidad_prueba;

create unique index if not exists inscripciones_email_jornada_key
  on public.inscripciones (email_norm, sorteo_id)
  where not identidad_prueba;


-- ───────────────────────────────────────────────────────────────────────────
-- 6. Un motivo más en el complemento congelado
--
-- `sorteo_excluidos` es la respuesta a «¿por qué esta persona no está en el
-- pool?». Si una fila de prueba se apartara con motivo 'inelegible' la respuesta
-- sería falsa, y la falsedad quedaría congelada.
-- ───────────────────────────────────────────────────────────────────────────

alter table public.sorteo_excluidos
  drop constraint if exists sorteo_excluidos_motivo_check;

alter table public.sorteo_excluidos
  add constraint sorteo_excluidos_motivo_check
  check (motivo in ('inelegible','email_invalido','ya_premiado','prueba'));


-- ───────────────────────────────────────────────────────────────────────────
-- 7. La auditoría deja de ser inmortal SOLO para los sorteos de prueba
--
-- Sigue siendo append-only en todo lo que importa: ningún UPDATE, nunca, y
-- ningún DELETE sobre la auditoría de un sorteo real. La excepción está escrita
-- en el esquema y es comprobable de un vistazo; la alternativa —`alter table
-- ... disable trigger` durante la limpieza— desprotege la tabla entera para
-- todas las transacciones y depende de acordarse de volver a encenderla.
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.solo_append()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' and exists (
    select 1 from public.sorteos s
    where s.id = old.sorteo_id and s.es_prueba
  ) then
    return old;
  end if;

  raise exception 'La auditoría del sorteo es append-only: no se actualiza ni se borra.';
end;
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- 8. ejecutar_sorteo consciente de las pruebas
--
-- Misma firma y mismo retorno que la versión de 20260819180000, así que CREATE
-- OR REPLACE conserva el GRANT. Cuatro cambios, todos del mismo tamaño:
--
--   1. Un sorteo de prueba se ejecuta cuando se aprieta el botón, sin esperar a
--      que cierre su ventana. La guardia existe para no dejar fuera a quien
--      está en plazo, y en un ensayo no hay nadie en plazo.
--
--   2. Una jornada de PRUEBA en borrador no bloquea el orden de las reales. Sin
--      esto, olvidarse de purgar dejaría el viernes a las 21:00 con el sorteo
--      negándose a correr porque «hay una jornada anterior sin ejecutar».
--
--   3. Las filas de prueba se apartan del pool de todo sorteo real, con su
--      motivo propio congelado en el complemento. En un sorteo de prueba, en
--      cambio, participan: es el ensayo entero lo que se quiere ver funcionando.
--
--   4. Un premio de un sorteo de PRUEBA no excluye a nadie de un sorteo real.
--      La regla del cliente es un premio por persona en la activación, y un
--      ensayo no reparte premios.
-- ───────────────────────────────────────────────────────────────────────────

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

  if s.criterio = 'jornada' and not s.es_prueba and not coalesce(p_forzar, false)
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
      and not sp.es_prueba
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
         -- 'prueba' va PRIMERO: una fila del equipo no es «inelegible», y ese
         -- motivo quedaría congelado como una respuesta falsa.
         case when i.es_prueba and not s.es_prueba      then 'prueba'
              when not i.elegible                       then 'inelegible'
              when i.email_estado in ('rebote','queja')  then 'email_invalido'
              else 'ya_premiado' end
  from public.inscripciones i
  where (case when s.criterio = 'jornada'
              then i.sorteo_id = s.id
              else (s.ventana_desde is null or i.creado_at >= s.ventana_desde)
               and (s.ventana_hasta is null or i.creado_at <  s.ventana_hasta)
         end)
    and (
      (i.es_prueba and not s.es_prueba)
      or not i.elegible
      or i.email_estado in ('rebote','queja')
      or (s.excluir_premiados and exists (
            -- Se cruza por RUT y no por correo: el RUT es la identidad con la que
            -- se entrega el premio. Cruzar también por correo excluiría a quien
            -- compartió la dirección con un familiar que ganó.
            select 1
            from public.inscripciones otra
            join public.sorteo_resultados r on r.inscripcion_id = otra.id
            join public.sorteos so on so.id = r.sorteo_id and not so.es_prueba
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

  -- Los correos NO se encolan acá: el de ganador sale a mano, por jornada, con
  -- encolar_correos_ganadores. Los de suplente ya no existen.

  update public.sorteos
  set estado = 'ejecutado', ejecutado_at = now(), ejecutado_por = p_actor
  where id = s.id;

  insert into public.sorteo_auditoria (sorteo_id, evento, detalle, actor)
  values (s.id, 'ejecutado',
          jsonb_build_object(
            'clave', s.clave,
            'criterio', s.criterio,
            'es_prueba', s.es_prueba,
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
-- 9. promover_suplente: un premio de ensayo no es un premio
--
-- Misma firma, así que CREATE OR REPLACE conserva el GRANT. Único cambio: el
-- cruce que busca «¿este suplente ya tiene premio en otra jornada?» ignora los
-- sorteos de prueba. Sin esto, ensayar la cascada dejaría a una persona real
-- impedida de ser promovida el domingo por un premio que nunca existió.
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
        join public.sorteos so on so.id = pr.sorteo_id and not so.es_prueba
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
-- 10. El interruptor de pruebas
--
-- Es una columna aparte y no un tercer valor de `inscripciones_abiertas`
-- porque son dos hechos independientes: «hay que aceptar altas» y «lo que entre
-- ahora no cuenta». Fundirlos obligaría a que el sitio dedujera el segundo del
-- primero, y esa deducción es justamente la que no puede fallar: de ella
-- depende el aviso que le dice a quien esté al otro lado que su inscripción no
-- participa en ningún sorteo.
-- ───────────────────────────────────────────────────────────────────────────

alter table public.configuracion
  add column if not exists modo_pruebas boolean not null default false;

comment on column public.configuracion.modo_pruebas is
  'Ensayo en curso. El sitio lo dice en el formulario: quien se inscriba mientras '
  'esté encendido no entra a ningún sorteo y su fila se borra con purgar_pruebas.';

/**
 * Lo que el sitio público necesita saber, en una sola ida a la base.
 *
 * Reemplaza a `estado_inscripciones()` en el sitio —que se queda por
 * compatibilidad— porque el modo pruebas se lee en las mismas pantallas y en el
 * mismo instante: una segunda RPC sería otra vuelta de 100 ms en el camino
 * crítico del formulario, para leer un booleano que cambia dos veces en toda la
 * campaña.
 */
create or replace function public.estado_publico()
returns table (inscripciones_abiertas boolean, modo_pruebas boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.inscripciones_abiertas, c.modo_pruebas
  from public.configuracion c
  where c.id
$$;

/** Las identidades exentas, para que el panel muestre las de verdad y no un
    texto copiado que se desactualiza en la primera vez que cambien. */
create or replace function public.listar_identidades_prueba()
returns table (clase text, valor text, nota text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.clase, p.valor, p.nota
  from public.identidades_prueba p
  order by p.clase, p.valor
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- 11. abrir_pruebas: la ventana de ensayo
--
-- Abrir el interruptor manual no alcanza. `inscripciones.sorteo_id` es not null
-- y lo resuelve el trigger contra las ventanas cargadas, así que fuera de toda
-- jornada el alta muere en `sin_jornada` por mucho que el concurso figure
-- abierto. Esta función crea la jornada que falta.
--
-- La ventana se calcula sola y queda encajada entre las reales:
--
--   desde  = ahora, nunca antes de que terminara la última jornada real pasada
--   hasta  = el comienzo de la próxima jornada real, o 24 h si no queda ninguna
--
-- Con eso la restricción EXCLUDE de `sorteos` —la que impide que dos jornadas
-- se pisen— no tiene nada que rechazar, y el viernes a las 05:00 la ventana de
-- pruebas se cierra sola en el mismo instante en que abre la de verdad: aunque
-- nadie apague el modo, ninguna inscripción real cae en la jornada de ensayo.
--
-- Si en este instante YA hay una jornada real corriendo, no se crea nada: las
-- altas ya funcionan, y lo único que hace falta es la marca de que se está
-- ensayando. Las filas del equipo quedarán igualmente fuera del pool por su
-- identidad.
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.abrir_pruebas(
  p_actor uuid default null,
  p_ganadores int default 2,
  p_suplentes int default 1
)
returns table (
  sorteo_id     bigint,
  nombre        text,
  ventana_desde timestamptz,
  ventana_hasta timestamptz,
  accion        text
)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_ahora  timestamptz := now();
  v_activa bigint;
  v_id     bigint;
  v_estado text;
  v_desde  timestamptz;
  v_hasta  timestamptz;
  v_nombre text := 'Jornada de pruebas';
  v_accion text;
begin
  select s.id, s.estado into v_id, v_estado
  from public.sorteos s where s.clave = 'prueba';

  -- Primero esto y no al final: un ensayo ya sorteado sigue teniendo su ventana
  -- abierta hasta su hora de cierre, así que `jornada_en` lo devolvería como
  -- jornada vigente y la siguiente alta caería DENTRO de un sorteo ejecutado,
  -- sin pool que la contenga y sin ninguna señal de que pasó.
  if v_estado in ('ejecutado','ejecutando') then
    raise exception
      'La jornada de pruebas ya se sorteó. Aprieta «Borrar datos de prueba» y vuelve a abrir: así el ensayo siguiente parte limpio en vez de acumularse sobre el anterior.'
      using errcode = 'invalid_parameter_value';
  end if;

  v_activa := public.jornada_en(v_ahora);

  /*
   * Con una jornada REAL corriendo, el ensayo no se abre. Y no es una
   * precaución de más: el modo enciende un aviso en el formulario que dice «lo
   * que entre ahora no participa», y durante una jornada real eso sería mentira
   * para toda la gente del mall. Además no hace falta: dentro de una jornada
   * real las altas ya funcionan y la identidad del equipo se inscribe igual,
   * sin límite y fuera del pool, porque su exención es por identidad y no por
   * ventana.
   *
   * Que la jornada vigente sea la de PRUEBA sí entra a la rama de abajo: es la
   * que le corre la ventana hasta el comienzo de la próxima jornada real.
   */
  if v_activa is not null and (v_id is null or v_activa <> v_id) then
    select s.nombre into v_nombre from public.sorteos s where s.id = v_activa;
    raise exception
      'Ahora mismo está corriendo "%": son inscripciones de verdad. Para probar no hace falta abrir nada —el RUT y el correo del equipo se inscriben sin límite y quedan fuera del sorteo—, y encender el ensayo pondría el aviso de «esto no participa» sobre las altas reales.',
      v_nombre
      using errcode = 'invalid_parameter_value';
  else
    select min(s.ventana_desde) into v_hasta
    from public.sorteos s
    where s.criterio = 'jornada' and s.estado <> 'anulado'
      and not s.es_prueba and s.ventana_desde > v_ahora;
    v_hasta := coalesce(v_hasta, v_ahora + interval '1 day');

    -- La ventana empieza AHORA, también al reabrir. Arrastrar el `desde` de un
    -- ensayo anterior la extendería hacia atrás sobre jornadas reales ya
    -- corridas y la EXCLUDE abortaría con un mensaje que no explica nada. No se
    -- pierde nada al recortarla: el pool de una jornada sale de `sorteo_id`, no
    -- de la ventana, así que las filas del ensayo previo siguen donde estaban.
    v_desde := v_ahora;

    if v_id is null then
      insert into public.sorteos
        (clave, nombre, semilla, criterio, es_prueba, excluir_premiados,
         ventana_desde, ventana_hasta, n_ganadores, n_suplentes)
      values
        ('prueba', v_nombre,
         -- Dos gen_random_uuid() y no gen_random_bytes(): el segundo vive en
         -- pgcrypto, que en Supabase está en el esquema `extensions` y no
         -- resolvería con el search_path fijo de esta función.
         replace(gen_random_uuid()::text, '-', '') ||
         replace(gen_random_uuid()::text, '-', ''),
         'jornada', true, false,
         v_desde, v_hasta,
         greatest(coalesce(p_ganadores, 2), 1),
         greatest(coalesce(p_suplentes, 1), 0))
      returning id into v_id;
      v_accion := 'creada';

    else
      update public.sorteos
      set nombre = v_nombre,
          estado = 'borrador',
          es_prueba = true,
          ventana_desde = v_desde,
          ventana_hasta = v_hasta,
          n_ganadores = greatest(coalesce(p_ganadores, 2), 1),
          n_suplentes = greatest(coalesce(p_suplentes, 1), 0)
      where id = v_id;
      v_accion := 'reabierta';
    end if;
  end if;

  update public.configuracion
  set inscripciones_abiertas = true,
      modo_pruebas = true,
      actualizado_at = now(),
      actualizado_por = p_actor
  where id;

  insert into public.sorteo_auditoria (sorteo_id, evento, detalle, actor)
  values (v_id, 'pruebas_abiertas',
          jsonb_build_object('accion', v_accion,
                             'ventana_desde', v_desde,
                             'ventana_hasta', v_hasta),
          p_actor);

  return query select v_id, v_nombre, v_desde, v_hasta, v_accion;
end;
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- 12. cerrar_pruebas
--
-- Devuelve el interruptor al calendario —no lo cierra a mano: dejarlo fijado en
-- `false` haría que el viernes a las 05:00 no abriera nada— y anula la jornada
-- de ensayo para que ninguna alta más caiga en ella. Los datos NO se borran
-- acá: cerrar y limpiar son dos decisiones distintas, y fundirlas convertiría
-- un clic de «ya terminé de probar» en un borrado irreversible.
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.cerrar_pruebas(p_actor uuid default null)
returns table (sorteo_id bigint, cerrada boolean)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_id bigint;
begin
  update public.configuracion
  set inscripciones_abiertas = null,
      modo_pruebas = false,
      actualizado_at = now(),
      actualizado_por = p_actor
  where id;

  /*
   * Se cierra la VENTANA, no solo el estado. Anular alcanza mientras el ensayo
   * siga en borrador, pero si ya se sorteó —probar el sorteo es justamente uno
   * de los ensayos— la fila queda en 'ejecutado' y `jornada_en` la seguiría
   * devolviendo hasta su hora de cierre: la siguiente alta caería dentro de un
   * sorteo YA EJECUTADO, sin pool que la contenga y sin forma de notarlo.
   */
  update public.sorteos
  set estado = case when estado = 'borrador' then 'anulado' else estado end,
      -- El microsegundo es el mínimo que respeta `ventana_desde < ventana_hasta`
      -- cuando se abre y se cierra el ensayo casi en el mismo instante. Con un
      -- segundo, la ventana quedaba abierta un segundo MÁS que ahora y
      -- `jornada_en` seguía devolviéndola.
      ventana_hasta = greatest(ventana_desde + interval '1 microsecond', now())
  where es_prueba and ventana_hasta > now()
  returning id into v_id;

  if v_id is not null then
    insert into public.sorteo_auditoria (sorteo_id, evento, detalle, actor)
    values (v_id, 'pruebas_cerradas', '{}'::jsonb, p_actor);
  end if;

  return query select v_id, v_id is not null;
end;
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- 13. purgar_pruebas
--
-- La excepción a la regla dura 4, acotada en el SQL y no en la disciplina de
-- quien la invoque. Borra, en el único orden que las claves ajenas permiten:
--
--   cola de correo → resultados → pool → excluidos → inscripciones
--   → auditoría del ensayo → el sorteo de ensayo
--
-- Qué entra:
--
--   · toda inscripción con `es_prueba` —identidad del equipo, o cualquiera que
--     haya entrado por la ventana de ensayo mientras el modo estaba encendido—;
--   · los sorteos de prueba que queden sin ninguna inscripción apuntándolos.
--
-- Qué NO entra, y por qué se informa en vez de callarse:
--
--   · una fila de prueba que cayó en una jornada REAL ya ejecutada. Su
--     pertenencia —o su exclusión— está congelada en un sorteo que hay que poder
--     auditar seis meses después, y borrarla dejaría un agujero en el
--     complemento que `verificar_membresia` no podría explicar. Son inofensivas:
--     ya quedaron fuera del pool con motivo 'prueba'.
--
-- Sobre borrar la fila de alguien que no es del equipo: mientras el modo está
-- encendido el formulario dice, en la misma pantalla donde se inscribe, que esa
-- inscripción no participa en ningún sorteo. Conservarla sería peor que
-- borrarla: quedaría una persona «inscrita» en una jornada que no se sortea
-- nunca.
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.purgar_pruebas(p_actor uuid default null)
returns table (
  inscripciones int,
  correos       int,
  resultados    int,
  pool          int,
  excluidos     int,
  auditoria     int,
  sorteos       int,
  conservadas   int
)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_ids  bigint[];
  v_ins  int := 0;
  v_cor  int := 0;
  v_res  int := 0;
  v_poo  int := 0;
  v_exc  int := 0;
  v_aud  int := 0;
  v_sor  int := 0;
  v_cons int := 0;
begin
  select coalesce(array_agg(i.id), '{}'::bigint[])
    into v_ids
  from public.inscripciones i
  join public.sorteos s on s.id = i.sorteo_id
  where i.es_prueba
    and not (not s.es_prueba and s.estado in ('ejecutado','ejecutando'));

  select count(*) into v_cons
  from public.inscripciones i
  where i.es_prueba and not (i.id = any(v_ids));

  -- Las promociones se apuntan entre sí con `promovido_desde`. Sin soltar esa
  -- referencia primero, la clave ajena de la tabla contra sí misma impide el
  -- borrado y el error no dice cuál fila lo bloqueó.
  update public.sorteo_resultados r
  set promovido_desde = null
  where r.promovido_desde in (
    select r2.id from public.sorteo_resultados r2
    where r2.inscripcion_id = any(v_ids)
       or r2.sorteo_id in (select s.id from public.sorteos s where s.es_prueba)
  );

  delete from public.email_outbox o where o.inscripcion_id = any(v_ids);
  get diagnostics v_cor = row_count;

  delete from public.sorteo_resultados r
  where r.inscripcion_id = any(v_ids)
     or r.sorteo_id in (select s.id from public.sorteos s where s.es_prueba);
  get diagnostics v_res = row_count;

  delete from public.sorteo_pool p
  where p.inscripcion_id = any(v_ids)
     or p.sorteo_id in (select s.id from public.sorteos s where s.es_prueba);
  get diagnostics v_poo = row_count;

  delete from public.sorteo_excluidos e
  where e.inscripcion_id = any(v_ids)
     or e.sorteo_id in (select s.id from public.sorteos s where s.es_prueba);
  get diagnostics v_exc = row_count;

  delete from public.inscripciones i where i.id = any(v_ids);
  get diagnostics v_ins = row_count;

  -- El sorteo de ensayo solo se va si ya no queda ninguna inscripción
  -- apuntándolo: la clave ajena lo exige, y además es la señal de que la
  -- limpieza fue completa.
  delete from public.sorteo_auditoria a
  where a.sorteo_id in (
    select s.id from public.sorteos s
    where s.es_prueba
      and not exists (select 1 from public.inscripciones i where i.sorteo_id = s.id)
  );
  get diagnostics v_aud = row_count;

  delete from public.sorteos s
  where s.es_prueba
    and not exists (select 1 from public.inscripciones i where i.sorteo_id = s.id);
  get diagnostics v_sor = row_count;

  return query select v_ins, v_cor, v_res, v_poo, v_exc, v_aud, v_sor, v_cons;
end;
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- 14. Las cifras del panel dejan de contar los ensayos
--
-- Sin esto, el modo pruebas sale caro justo donde no se nota: el total del
-- viernes por la mañana viene inflado por cuarenta altas del equipo, el reporte
-- por panel acredita esas altas a 'directo', y nadie tiene forma de saber
-- cuántas de las 812 inscripciones son de verdad. Las de prueba no desaparecen
-- de la pantalla —se cuentan aparte, en su propia cifra— porque un dato que no
-- se ve es un dato que se olvida purgar.
--
-- Las cuatro que cambian de tipo de retorno van DROP + CREATE: CREATE OR
-- REPLACE no puede cambiarlo. Hay que reconceder EXECUTE, y de eso se encarga
-- el barrido del final.
-- ───────────────────────────────────────────────────────────────────────────

drop function if exists public.resumen_inscripciones();

create or replace function public.resumen_inscripciones()
returns table (
  total         bigint,
  personas      bigint,
  elegibles     bigint,
  con_marketing bigint,
  rebotes       bigint,
  quejas        bigint,
  pruebas       bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*) filter (where not es_prueba),
         count(distinct documento_norm) filter (where not es_prueba),
         count(*) filter (where elegible and not es_prueba),
         count(*) filter (where acepta_marketing and not es_prueba),
         count(*) filter (where email_estado = 'rebote' and not es_prueba),
         count(*) filter (where email_estado = 'queja' and not es_prueba),
         count(*) filter (where es_prueba)
  from public.inscripciones
$$;

create or replace function public.resumen_por_panel()
returns table (origen text, total bigint, elegibles bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select i.origen, count(*), count(*) filter (where i.elegible)
  from public.inscripciones i
  where not i.es_prueba
  group by i.origen
  order by count(*) desc
$$;

drop function if exists public.resumen_jornadas();

create or replace function public.resumen_jornadas()
returns table (
  sorteo_id     bigint,
  clave         text,
  nombre        text,
  estado        text,
  ventana_desde timestamptz,
  ventana_hasta timestamptz,
  inscritos     bigint,
  pruebas       bigint,
  es_prueba     boolean,
  vigente       boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.id, s.clave, s.nombre, s.estado, s.ventana_desde, s.ventana_hasta,
         (select count(*) from public.inscripciones i
           where i.sorteo_id = s.id and not i.es_prueba),
         (select count(*) from public.inscripciones i
           where i.sorteo_id = s.id and i.es_prueba),
         s.es_prueba,
         s.ventana_desde <= now() and s.ventana_hasta > now()
  from public.sorteos s
  where s.criterio = 'jornada' and s.estado <> 'anulado'
  order by s.ventana_desde
$$;

drop function if exists public.listar_sorteos();

create or replace function public.listar_sorteos()
returns table (
  id bigint,
  clave text,
  nombre text,
  estado text,
  criterio text,
  es_prueba boolean,
  excluir_premiados boolean,
  ventana_desde timestamptz,
  ventana_hasta timestamptz,
  n_ganadores int,
  n_suplentes int,
  creado_at timestamptz,
  ejecutado_at timestamptz,
  inscritos bigint,
  pruebas bigint,
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
  select s.id, s.clave, s.nombre, s.estado, s.criterio, s.es_prueba,
         s.excluir_premiados,
         s.ventana_desde, s.ventana_hasta, s.n_ganadores, s.n_suplentes,
         s.creado_at, s.ejecutado_at,
         (select count(*) from public.inscripciones i
           where i.sorteo_id = s.id and not i.es_prueba),
         (select count(*) from public.inscripciones i
           where i.sorteo_id = s.id and i.es_prueba),
         (select count(*) from public.sorteo_pool p where p.sorteo_id = s.id),
         (select count(*) from public.sorteo_excluidos e where e.sorteo_id = s.id),
         (select count(*) from public.sorteo_resultados r
           where r.sorteo_id = s.id and r.rol in ('ganador','promovido')),
         (select count(*) from public.sorteo_resultados r
           where r.sorteo_id = s.id and r.rol = 'suplente'),
         case when s.estado = 'ejecutado' then public.verificar_sorteo(s.id) end,
         case when s.estado = 'ejecutado' then public.verificar_membresia(s.id) end
  from public.sorteos s
  -- Las jornadas primero y en orden de calendario: son las tres filas que el
  -- equipo mira. Los sorteos ad-hoc quedan debajo, del más nuevo al más viejo.
  order by (s.criterio = 'jornada') desc, s.ventana_desde, s.id desc
  limit 100
$$;

drop function if exists public.listar_inscripciones(text, text, boolean, timestamptz, bigint, int, bigint);

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
  sorteo_id bigint,
  es_prueba boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select i.id, i.creado_at, i.nombre, i.email, i.telefono, i.documento,
         i.origen, i.elegible, i.email_estado, i.acepta_marketing, i.sorteo_id,
         i.es_prueba
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

/**
 * Personas con premio en más de un sorteo REAL. Los ensayos no reparten
 * premios: incluirlos convertiría esta alarma —que existe para mirarla antes de
 * entregar— en una que suena siempre y por eso no se mira.
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
  join public.sorteos s on s.id = r.sorteo_id
  where r.rol in ('ganador','promovido')
    and not s.es_prueba
  group by i.documento_norm
  having count(*) > 1
  order by count(*) desc
  limit 200
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- 15. Permisos: barrido final
--
-- ⚠️ LA TRAMPA DE SUPABASE SIGUE ARMADA. El ALTER DEFAULT PRIVILEGES de
-- 20260819170000 ya la desactivó para anon y authenticated, pero esta migración
-- crea siete funciones nuevas y rehace cinco, y el barrido es lo que garantiza
-- que lo concedido sea exactamente lo enumerado. Se revoca todo y se devuelve
-- una por una.
-- ───────────────────────────────────────────────────────────────────────────

revoke execute on all functions in schema public from public, anon, authenticated;

-- Únicas puertas públicas: el alta del formulario y el estado que pinta el sitio.
grant execute on function public.crear_inscripcion(
  text, text, text, text, boolean, boolean, boolean, text
) to anon, authenticated;
grant execute on function public.estado_inscripciones() to anon, authenticated;
grant execute on function public.estado_publico()       to anon, authenticated;

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
grant execute on function public.encolar_correos_ganadores(bigint, uuid) to authenticated;
grant execute on function public.verificar_sorteo(bigint)                to authenticated;
grant execute on function public.verificar_membresia(bigint)             to authenticated;
grant execute on function public.set_inscripciones(boolean, uuid)        to authenticated;

-- Las de este archivo. Nunca a anon: abrir el ensayo, cerrarlo y borrar sus
-- datos son operaciones del equipo.
grant execute on function public.abrir_pruebas(uuid, int, int)           to authenticated;
grant execute on function public.cerrar_pruebas(uuid)                    to authenticated;
grant execute on function public.purgar_pruebas(uuid)                    to authenticated;
grant execute on function public.listar_identidades_prueba()             to authenticated;

-- Sin conceder a propósito, para que el revoke de arriba no se lea como un olvido:
--   · El drenaje de la cola y el webhook corren con el service role, que salta
--     RLS: tomar_lote_email, marcar_email_enviado, marcar_email_error,
--     rescatar_emails_colgados, registrar_evento_email.
--   · jornada_en, resolver_jornada y solo_append son internas.

-- PostgREST cachea la firma de las funciones. Supabase suele recargar por event
-- trigger, pero con cinco DROP + CREATE conviene forzarlo.
notify pgrst, 'reload schema';
