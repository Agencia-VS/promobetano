-- ============================================================================
-- Hotfix: ruleta instantánea con stock diario y numeración global.
--
-- Reglas que quedan impuestas en la base (no solo en la interfaz):
--   · un ganador en una posición aleatoria de cada bloque completo de N;
--   · el N de un bloque no cambia una vez abierto;
--   · máximo 30 premios por jornada y 90 en toda la activación;
--   · folios correlativos 1..90 sin huecos por concurrencia;
--   · una inscripción por RUT O correo en cada jornada (índices existentes);
--   · idempotencia del POST mediante request_id;
--   · ningún correo de confirmación nuevo; solo se encola el de ganador.
--
-- El volumen esperado es de hasta ~500 altas por jornada. Serializar durante
-- unos milisegundos sobre la fila de configuración de la jornada es deliberado:
-- hace la asignación fácil de auditar y elimina carreras sin necesitar una cola.
-- ============================================================================


-- ── 1. Modalidad y resultado persistido ─────────────────────────────────────

alter table public.sorteos
  add column if not exists modalidad text not null default 'diferido';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sorteos_modalidad_valida'
  ) then
    alter table public.sorteos add constraint sorteos_modalidad_valida
      check (modalidad in ('diferido', 'instantaneo'));
  end if;
end;
$$;

-- Solo se convierten las jornadas reales que todavía no se ejecutaron. Un
-- resultado histórico nunca cambia de modalidad al aplicar este hotfix.
update public.sorteos s
set modalidad = 'instantaneo',
    n_ganadores = 30,
    n_suplentes = 0
where s.criterio = 'jornada'
  and not s.es_prueba
  and s.estado = 'borrador'
  and not exists (
    select 1 from public.sorteo_resultados r where r.sorteo_id = s.id
  );

alter table public.inscripciones
  add column if not exists request_id uuid;
alter table public.inscripciones
  add column if not exists ruleta_ganador boolean;
alter table public.inscripciones
  add column if not exists ruleta_numero int;
alter table public.inscripciones
  add column if not exists ruleta_resuelta_at timestamptz;

create unique index if not exists inscripciones_request_id_key
  on public.inscripciones (request_id)
  where request_id is not null;

create unique index if not exists inscripciones_ruleta_numero_key
  on public.inscripciones (ruleta_numero)
  where ruleta_numero is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'inscripciones_ruleta_numero_valido'
  ) then
    alter table public.inscripciones
      add constraint inscripciones_ruleta_numero_valido
      check (ruleta_numero is null or ruleta_numero between 1 and 90);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'inscripciones_ruleta_resultado_coherente'
  ) then
    alter table public.inscripciones
      add constraint inscripciones_ruleta_resultado_coherente
      check (
        (ruleta_resuelta_at is null and ruleta_ganador is null and ruleta_numero is null)
        or
        (ruleta_resuelta_at is not null and ruleta_ganador is not null
          and (ruleta_ganador or ruleta_numero is null))
      );
  end if;
end;
$$;

alter table public.sorteo_resultados
  add column if not exists numero_ganador int;

create unique index if not exists sorteo_resultados_numero_ganador_key
  on public.sorteo_resultados (numero_ganador)
  where numero_ganador is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sorteo_resultados_numero_ganador_valido'
  ) then
    alter table public.sorteo_resultados
      add constraint sorteo_resultados_numero_ganador_valido
      check (numero_ganador is null or numero_ganador between 1 and 90);
  end if;
end;
$$;


-- ── 2. Configuración, bloques y contador global ─────────────────────────────

create table if not exists public.ruleta_configuracion (
  sorteo_id      bigint primary key references public.sorteos(id),
  modo           text not null default 'automatico'
    check (modo in ('automatico', 'manual')),
  n_inicial      int not null default 16 check (n_inicial between 1 and 10000),
  n_manual       int check (n_manual between 1 and 10000),
  limite_diario  int not null default 30 check (limite_diario between 1 and 30),
  actualizado_at timestamptz not null default now(),
  actualizado_por uuid,
  constraint ruleta_configuracion_manual_con_n
    check (modo <> 'manual' or n_manual is not null)
);

create table if not exists public.ruleta_bloques (
  id                     bigint generated always as identity primary key,
  sorteo_id              bigint not null references public.sorteos(id),
  numero                 int not null check (numero > 0),
  n_aplicado             int not null check (n_aplicado between 1 and 10000),
  posicion_ganadora      int not null,
  posicion_actual        int not null default 0,
  fuente_n               text not null check (fuente_n in ('automatico', 'manual')),
  ganador_inscripcion_id bigint references public.inscripciones(id),
  creado_at              timestamptz not null default now(),
  cerrado_at             timestamptz,
  constraint ruleta_bloques_posicion_ganadora
    check (posicion_ganadora between 1 and n_aplicado),
  constraint ruleta_bloques_posicion_actual
    check (posicion_actual between 0 and n_aplicado),
  constraint ruleta_bloques_unico unique (sorteo_id, numero)
);

-- La base misma impide que dos peticiones abran dos bloques en paralelo.
create unique index if not exists ruleta_bloques_uno_abierto_key
  on public.ruleta_bloques (sorteo_id)
  where cerrado_at is null;

alter table public.inscripciones
  add column if not exists ruleta_bloque_id bigint
    references public.ruleta_bloques(id);

create index if not exists inscripciones_ruleta_bloque_idx
  on public.inscripciones (ruleta_bloque_id)
  where ruleta_bloque_id is not null;

-- Una sola fila es el candado de la secuencia 1..90. Solo se bloquea cuando la
-- posición del bloque resulta ganadora, no en las altas perdedoras.
create table if not exists public.ruleta_global (
  id               smallint primary key default 1 check (id = 1),
  siguiente_numero int not null default 1 check (siguiente_numero between 1 and 91),
  limite_total     int not null default 90 check (limite_total = 90),
  actualizado_at   timestamptz not null default now()
);

insert into public.ruleta_global (id, siguiente_numero, limite_total)
select 1, coalesce(max(r.numero_ganador), 0) + 1, 90
from public.sorteo_resultados r
on conflict (id) do update
set siguiente_numero = greatest(
      public.ruleta_global.siguiente_numero,
      excluded.siguiente_numero
    ),
    actualizado_at = now();

insert into public.ruleta_configuracion (sorteo_id, modo, n_inicial)
select s.id, 'automatico', 16
from public.sorteos s
where s.modalidad = 'instantaneo'
on conflict (sorteo_id) do nothing;

alter table public.ruleta_configuracion enable row level security;
alter table public.ruleta_configuracion force row level security;
alter table public.ruleta_bloques enable row level security;
alter table public.ruleta_bloques force row level security;
alter table public.ruleta_global enable row level security;
alter table public.ruleta_global force row level security;

revoke all on public.ruleta_configuracion from anon, authenticated;
revoke all on public.ruleta_bloques from anon, authenticated;
revoke all on public.ruleta_global from anon, authenticated;
revoke all on sequence public.ruleta_bloques_id_seq from anon, authenticated;


-- ── 3. Evitar que el sorteo diferido se ejecute por accidente ──────────────

create or replace function public.proteger_sorteo_instantaneo()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.modalidad = 'instantaneo' and new.estado = 'ejecutando' then
    raise exception
      'La jornada % usa ruleta instantánea y no admite el sorteo diferido.', old.id
      using errcode = 'invalid_parameter_value';
  end if;
  return new;
end;
$$;

drop trigger if exists sorteos_proteger_instantaneo on public.sorteos;
create trigger sorteos_proteger_instantaneo
  before update of estado on public.sorteos
  for each row execute function public.proteger_sorteo_instantaneo();


-- ── 4. N automático para el PRÓXIMO bloque ─────────────────────────────────

create or replace function public.ruleta_n_automatico(
  p_sorteo_id bigint,
  p_instante timestamptz default now()
)
returns int
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_desde       timestamptz;
  v_hasta       timestamptz;
  v_n_inicial   int;
  v_limite      int;
  v_ganadores   int;
  v_participan  int;
  v_transcurrido numeric;
  v_restante     numeric;
  v_estimadas    numeric;
  v_premios      int;
begin
  select s.ventana_desde, s.ventana_hasta, c.n_inicial, c.limite_diario
  into v_desde, v_hasta, v_n_inicial, v_limite
  from public.sorteos s
  join public.ruleta_configuracion c on c.sorteo_id = s.id
  where s.id = p_sorteo_id;

  if not found then return 16; end if;

  select count(*) into v_ganadores
  from public.sorteo_resultados r
  where r.sorteo_id = p_sorteo_id and r.numero_ganador is not null;

  v_premios := greatest(v_limite - v_ganadores, 0);
  if v_premios = 0 then return 1; end if;

  select count(*) into v_participan
  from public.inscripciones i
  where i.sorteo_id = p_sorteo_id
    and not i.es_prueba
    and i.ruleta_bloque_id is not null;

  v_transcurrido := greatest(
    extract(epoch from (p_instante - v_desde)),
    60
  );
  v_restante := greatest(extract(epoch from (v_hasta - p_instante)), 0);

  -- Con menos de diez observaciones o durante los primeros quince minutos no
  -- hay una tasa útil: se usa el N inicial (16 ~= 500 / 30).
  if v_participan < 10 or v_transcurrido < 900 then
    return v_n_inicial;
  end if;

  v_estimadas := least(
    (v_participan::numeric / v_transcurrido) * v_restante,
    greatest((v_n_inicial * v_limite) - v_participan, 0)
  );

  -- El segundo término acota la proyección al aforo que expresa el N inicial
  -- (16 * 30 = 480). Sin ese techo, una ráfaga en los primeros minutos podía
  -- abrir un bloque enorme; si el flujo se cortaba después, ese bloque jamás
  -- terminaba y el automático no tenía oportunidad de corregirlo.

  -- floor favorece agotar el stock. Al acercarse el cierre, la proyección baja
  -- y el resultado puede llegar a N=1, tal como se acordó.
  return least(
    10000,
    greatest(1, floor(v_estimadas / v_premios)::int)
  );
end;
$$;


-- ── 5. Alta y resolución atómicas ──────────────────────────────────────────

create or replace function public.crear_inscripcion_ruleta(
  p_nombre text,
  p_email text,
  p_telefono text,
  p_documento text,
  p_declara_edad boolean,
  p_acepta_bases boolean,
  p_acepta_marketing boolean default false,
  p_origen text default 'directo',
  p_request_id uuid default null
)
returns table (
  resultado text,
  inscripcion_id bigint,
  ganador boolean,
  numero_ganador int,
  es_prueba boolean,
  sorteo_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_id            bigint;
  v_jornada       bigint;
  v_doc           text;
  v_es_prueba     boolean;
  v_sorteo_at     timestamptz;
  v_modalidad     text;
  v_config        public.ruleta_configuracion%rowtype;
  v_bloque        public.ruleta_bloques%rowtype;
  v_numero_bloque int;
  v_n             int;
  v_posicion      int;
  v_ganador       boolean := false;
  v_numero        int;
  v_diarios       int;
  v_global        public.ruleta_global%rowtype;
begin
  -- Un reintento por timeout devuelve exactamente la decisión ya persistida.
  if p_request_id is not null then
    select i.id, i.ruleta_ganador, i.ruleta_numero, i.es_prueba,
           s.ventana_hasta
    into v_id, v_ganador, v_numero, v_es_prueba, v_sorteo_at
    from public.inscripciones i
    join public.sorteos s on s.id = i.sorteo_id
    where i.request_id = p_request_id;

    if found then
      return query select 'creada'::text, v_id, coalesce(v_ganador, false),
                          v_numero, v_es_prueba, v_sorteo_at;
      return;
    end if;
  else
    return query select 'datos_invalidos'::text, null::bigint, false,
                        null::int, false, null::timestamptz;
    return;
  end if;

  if btrim(coalesce(p_nombre, '')) = ''
     or btrim(coalesce(p_email, '')) = ''
     or coalesce(p_telefono, '') = ''
     or btrim(coalesce(p_documento, '')) = '' then
    return query select 'datos_invalidos'::text, null::bigint, false,
                        null::int, false, null::timestamptz;
    return;
  end if;

  if not (p_declara_edad and p_acepta_bases) then
    return query select 'falta_consentimiento'::text, null::bigint, false,
                        null::int, false, null::timestamptz;
    return;
  end if;

  if not public.rut_valido(p_documento) then
    return query select 'rut_invalido'::text, null::bigint, false,
                        null::int, false, null::timestamptz;
    return;
  end if;

  v_jornada := public.jornada_en(now());
  if v_jornada is null then
    return query select 'sin_jornada'::text, null::bigint, false,
                        null::int, false, null::timestamptz;
    return;
  end if;

  select s.modalidad, s.ventana_hasta
  into v_modalidad, v_sorteo_at
  from public.sorteos s where s.id = v_jornada;

  -- Las jornadas de ensayo funcionan aunque hayan sido creadas antes del
  -- hotfix. En una jornada real, en cambio, no se mezcla ruleta con diferido.
  if v_modalidad <> 'instantaneo'
     and not exists (select 1 from public.sorteos s where s.id = v_jornada and s.es_prueba) then
    return query select 'sin_jornada'::text, null::bigint, false,
                        null::int, false, v_sorteo_at;
    return;
  end if;

  v_doc := public.rut_norm(p_documento);

  if exists (
    select 1 from public.inscripciones
    where documento_norm = v_doc
      and not elegible
      and motivo_inelegible is not null
  ) then
    return query select 'vetado'::text, null::bigint, false,
                        null::int, false, v_sorteo_at;
    return;
  end if;

  begin
    insert into public.inscripciones (
      nombre, email, telefono, documento,
      declara_edad, acepta_bases, acepta_marketing, origen, request_id
    )
    values (
      btrim(p_nombre), btrim(p_email), p_telefono, btrim(p_documento),
      p_declara_edad, p_acepta_bases, coalesce(p_acepta_marketing, false),
      coalesce(p_origen, 'directo'), p_request_id
    )
    returning id, inscripciones.es_prueba
    into v_id, v_es_prueba;
  exception
    when unique_violation then
      -- La carrera del mismo request se resuelve por request_id antes de
      -- reportar duplicado. La otra transacción ya tuvo que terminar para que
      -- este INSERT recibiera el unique_violation.
      select i.id, i.ruleta_ganador, i.ruleta_numero, i.es_prueba
      into v_id, v_ganador, v_numero, v_es_prueba
      from public.inscripciones i where i.request_id = p_request_id;

      if found then
        return query select 'creada'::text, v_id, coalesce(v_ganador, false),
                            v_numero, v_es_prueba, v_sorteo_at;
      elsif exists (
        select 1 from public.inscripciones
        where documento_norm = v_doc and sorteo_id = v_jornada
          and not identidad_prueba
      ) then
        return query select 'duplicado_rut'::text, null::bigint, false,
                            null::int, false, v_sorteo_at;
      else
        return query select 'duplicado_email'::text, null::bigint, false,
                            null::int, false, v_sorteo_at;
      end if;
      return;
    when sqlstate 'ZJ001' then
      return query select 'sin_jornada'::text, null::bigint, false,
                          null::int, false, null::timestamptz;
      return;
    when check_violation then
      return query select 'datos_invalidos'::text, null::bigint, false,
                          null::int, false, v_sorteo_at;
      return;
  end;

  -- Las identidades/jornadas de ensayo recorren toda la UI, pero jamás toman
  -- stock ni un número real. El resultado queda persistido para los reintentos.
  if v_es_prueba then
    v_ganador := random() < 0.5;
    update public.inscripciones
    set ruleta_ganador = v_ganador, ruleta_resuelta_at = now()
    where id = v_id;

    return query select 'creada'::text, v_id, v_ganador, null::int,
                        true, v_sorteo_at;
    return;
  end if;

  -- La regla histórica sigue vigente: una persona puede participar cada día,
  -- pero después de ganar una vez ya no consume posiciones de bloques futuros.
  if exists (
    select 1
    from public.inscripciones previa
    join public.sorteo_resultados r on r.inscripcion_id = previa.id
    join public.sorteos s on s.id = r.sorteo_id and not s.es_prueba
    where previa.documento_norm = v_doc
      and previa.id <> v_id
      and r.numero_ganador is not null
  ) then
    update public.inscripciones
    set ruleta_ganador = false, ruleta_resuelta_at = now()
    where id = v_id;

    return query select 'creada'::text, v_id, false, null::int,
                        false, v_sorteo_at;
    return;
  end if;

  insert into public.ruleta_configuracion (sorteo_id, modo, n_inicial)
  values (v_jornada, 'automatico', 16)
  on conflict (sorteo_id) do nothing;

  -- Mutex por jornada. Mientras esta fila está bloqueada, se lee/avanza un
  -- solo bloque y se vuelve imposible entregar dos veces la misma posición.
  select * into v_config
  from public.ruleta_configuracion c
  where c.sorteo_id = v_jornada
  for update;

  select count(*) into v_diarios
  from public.sorteo_resultados r
  where r.sorteo_id = v_jornada and r.numero_ganador is not null;

  if v_diarios >= v_config.limite_diario
     or exists (
       select 1 from public.ruleta_global g
       where g.id = 1 and g.siguiente_numero > g.limite_total
     ) then
    update public.inscripciones
    set ruleta_ganador = false, ruleta_resuelta_at = now()
    where id = v_id;

    return query select 'creada'::text, v_id, false, null::int,
                        false, v_sorteo_at;
    return;
  end if;

  select * into v_bloque
  from public.ruleta_bloques b
  where b.sorteo_id = v_jornada and b.cerrado_at is null
  for update;

  if not found then
    if v_config.modo = 'manual' then
      v_n := v_config.n_manual;
    else
      v_n := public.ruleta_n_automatico(v_jornada, now());
    end if;

    select coalesce(max(b.numero), 0) + 1 into v_numero_bloque
    from public.ruleta_bloques b where b.sorteo_id = v_jornada;

    insert into public.ruleta_bloques (
      sorteo_id, numero, n_aplicado, posicion_ganadora, fuente_n
    ) values (
      v_jornada, v_numero_bloque, v_n,
      floor(random() * v_n)::int + 1, v_config.modo
    ) returning * into v_bloque;
  end if;

  v_posicion := v_bloque.posicion_actual + 1;
  v_ganador := v_posicion = v_bloque.posicion_ganadora;

  if v_ganador then
    select * into v_global
    from public.ruleta_global g where g.id = 1
    for update;

    -- Revisión bajo los dos candados: otra jornada puede haber tomado el folio
    -- 90 después de la lectura optimista de arriba.
    select count(*) into v_diarios
    from public.sorteo_resultados r
    where r.sorteo_id = v_jornada and r.numero_ganador is not null;

    if v_diarios < v_config.limite_diario
       and v_global.siguiente_numero <= v_global.limite_total then
      v_numero := v_global.siguiente_numero;

      update public.ruleta_global
      set siguiente_numero = siguiente_numero + 1, actualizado_at = now()
      where id = 1;

      update public.inscripciones
      set ruleta_ganador = true,
          ruleta_numero = v_numero,
          ruleta_bloque_id = v_bloque.id,
          ruleta_resuelta_at = now()
      where id = v_id;

      insert into public.sorteo_resultados (
        sorteo_id, inscripcion_id, posicion, rol, numero_ganador
      ) values (
        v_jornada, v_id, v_diarios + 1, 'ganador', v_numero
      );

      insert into public.email_outbox (inscripcion_id, tipo)
      values (v_id, 'ganador')
      on conflict on constraint email_outbox_unico do nothing;

      insert into public.sorteo_auditoria (sorteo_id, evento, detalle)
      values (
        v_jornada,
        'ganador_instantaneo',
        jsonb_build_object(
          'inscripcion_id', v_id,
          'numero_ganador', v_numero,
          'bloque', v_bloque.numero,
          'n', v_bloque.n_aplicado,
          'posicion', v_posicion,
          'fuente_n', v_bloque.fuente_n
        )
      );
    else
      v_ganador := false;
    end if;
  end if;

  if not v_ganador then
    update public.inscripciones
    set ruleta_ganador = false,
        ruleta_bloque_id = v_bloque.id,
        ruleta_resuelta_at = now()
    where id = v_id;
  end if;

  update public.ruleta_bloques
  set posicion_actual = v_posicion,
      ganador_inscripcion_id = case
        when v_ganador then v_id else ganador_inscripcion_id end,
      cerrado_at = case
        when v_posicion >= n_aplicado then now() else cerrado_at end
  where id = v_bloque.id;

  return query select 'creada'::text, v_id, v_ganador, v_numero,
                      false, v_sorteo_at;
end;
$$;

-- Compatibilidad durante un despliegue escalonado: una versión anterior del
-- frontend puede llamar esta firma por unos minutos. Ya no encola confirmación
-- y, si ganó, al menos recibirá el correo de respaldo.
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
returns table (resultado text, inscripcion_id bigint)
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  select r.resultado, r.inscripcion_id
  from public.crear_inscripcion_ruleta(
    p_nombre, p_email, p_telefono, p_documento,
    p_declara_edad, p_acepta_bases, p_acepta_marketing, p_origen,
    gen_random_uuid()
  ) r
$$;


-- ── 6. Estado público automático por las ventanas administrables ───────────

create or replace function public.estado_publico()
returns table (inscripciones_abiertas boolean, modo_pruebas boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- Se conserva CRUDO para el panel existente: null significa que el control
  -- está en calendario; true/false siguen siendo el override de emergencia.
  select c.inscripciones_abiertas, c.modo_pruebas
  from public.configuracion c
  where c.id
$$;

create or replace function public.estado_ruleta_publico()
returns table (
  inscripciones_abiertas boolean,
  modo_pruebas boolean,
  control_manual boolean,
  ventana_desde timestamptz,
  ventana_hasta timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    coalesce(
      c.inscripciones_abiertas,
      exists (
        select 1 from public.sorteos s
        where s.criterio = 'jornada'
          and s.estado <> 'anulado'
          and s.ventana_desde <= now()
          and s.ventana_hasta > now()
          and (
            (not s.es_prueba and s.modalidad = 'instantaneo')
            or (s.es_prueba and c.modo_pruebas)
          )
      )
    ),
    c.modo_pruebas and exists (
      select 1 from public.sorteos s
      where s.es_prueba
        and s.estado <> 'anulado'
        and s.ventana_desde <= now()
        and s.ventana_hasta > now()
    ),
    c.inscripciones_abiertas is not null,
    coalesce(activa.ventana_desde, proxima.ventana_desde),
    coalesce(activa.ventana_hasta, proxima.ventana_hasta)
  from public.configuracion c
  left join lateral (
    select s.ventana_desde, s.ventana_hasta
    from public.sorteos s
    where s.criterio = 'jornada'
      and s.estado <> 'anulado'
      and s.ventana_desde <= now()
      and s.ventana_hasta > now()
      and (
        (not s.es_prueba and s.modalidad = 'instantaneo')
        or (s.es_prueba and c.modo_pruebas)
      )
    order by s.ventana_desde
    limit 1
  ) activa on true
  left join lateral (
    select s.ventana_desde, s.ventana_hasta
    from public.sorteos s
    where s.criterio = 'jornada'
      and s.estado <> 'anulado'
      and s.ventana_desde > now()
      and not s.es_prueba
      and s.modalidad = 'instantaneo'
    order by s.ventana_desde
    limit 1
  ) proxima on true
  where c.id
$$;

create or replace function public.listar_jornadas_ruleta_publico()
returns table (
  nombre text,
  ventana_desde timestamptz,
  ventana_hasta timestamptz,
  limite_diario int
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.nombre, s.ventana_desde, s.ventana_hasta, c.limite_diario
  from public.sorteos s
  join public.ruleta_configuracion c on c.sorteo_id = s.id
  where s.modalidad = 'instantaneo'
    and not s.es_prueba
    and s.estado <> 'anulado'
  order by s.ventana_desde
$$;


-- ── 7. Panel de la ruleta ───────────────────────────────────────────────────

create or replace function public.estado_ruleta_admin()
returns table (
  sorteo_id bigint,
  clave text,
  nombre text,
  ventana_desde timestamptz,
  ventana_hasta timestamptz,
  abierta boolean,
  modo text,
  n_inicial int,
  n_manual int,
  n_actual int,
  n_siguiente int,
  bloque_numero int,
  bloque_posicion int,
  bloque_tamano int,
  inscritos int,
  ganadores int,
  limite_diario int,
  ganadores_total int,
  limite_total int
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    s.id,
    s.clave,
    s.nombre,
    s.ventana_desde,
    s.ventana_hasta,
    s.ventana_desde <= now() and s.ventana_hasta > now(),
    c.modo,
    c.n_inicial,
    c.n_manual,
    coalesce(
      b.n_aplicado,
      case when c.modo = 'manual' then c.n_manual
           else public.ruleta_n_automatico(s.id, now()) end
    ),
    case when c.modo = 'manual' then c.n_manual
         else public.ruleta_n_automatico(s.id, now()) end,
    b.numero,
    b.posicion_actual,
    b.n_aplicado,
    (select count(*)::int from public.inscripciones i
      where i.sorteo_id = s.id and not i.es_prueba),
    (select count(*)::int from public.sorteo_resultados r
      where r.sorteo_id = s.id and r.numero_ganador is not null),
    c.limite_diario,
    (select count(*)::int from public.sorteo_resultados r
      where r.numero_ganador is not null),
    g.limite_total
  from public.sorteos s
  join public.ruleta_configuracion c on c.sorteo_id = s.id
  join public.ruleta_global g on g.id = 1
  left join public.ruleta_bloques b
    on b.sorteo_id = s.id and b.cerrado_at is null
  where s.modalidad = 'instantaneo' and not s.es_prueba
  order by s.ventana_desde
$$;

create or replace function public.listar_ganadores_ruleta()
returns table (
  numero_ganador int,
  creado_at timestamptz,
  jornada text,
  nombre text,
  email text,
  documento text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.numero_ganador, r.creado_at, s.nombre, i.nombre, i.email, i.documento
  from public.sorteo_resultados r
  join public.inscripciones i on i.id = r.inscripcion_id
  join public.sorteos s on s.id = r.sorteo_id
  where r.numero_ganador is not null and not s.es_prueba
  order by r.numero_ganador
$$;

create or replace function public.configurar_ruleta(
  p_sorteo_id bigint,
  p_modo text,
  p_n int,
  p_ventana_desde timestamp without time zone,
  p_ventana_hasta timestamp without time zone,
  p_actor uuid default null
)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_desde timestamptz;
  v_hasta timestamptz;
begin
  if p_modo not in ('automatico', 'manual') then
    raise exception 'Modo de ruleta inválido.' using errcode = 'invalid_parameter_value';
  end if;
  if p_n is null or p_n < 1 or p_n > 10000 then
    raise exception 'N debe estar entre 1 y 10000.' using errcode = 'invalid_parameter_value';
  end if;
  if p_ventana_desde is null or p_ventana_hasta is null then
    raise exception 'La apertura y el cierre son obligatorios.' using errcode = 'invalid_parameter_value';
  end if;

  v_desde := p_ventana_desde at time zone 'America/Santiago';
  v_hasta := p_ventana_hasta at time zone 'America/Santiago';
  if v_desde >= v_hasta then
    raise exception 'El cierre debe ser posterior a la apertura.' using errcode = 'invalid_parameter_value';
  end if;

  if not exists (
    select 1 from public.sorteos s
    where s.id = p_sorteo_id and s.modalidad = 'instantaneo' and not s.es_prueba
  ) then
    raise exception 'La jornada no pertenece a la ruleta instantánea.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- La EXCLUDE sorteos_jornadas_sin_solape sigue siendo la última defensa: si
  -- una edición pisa otra jornada, toda esta función se revierte.
  update public.sorteos
  set ventana_desde = v_desde, ventana_hasta = v_hasta
  where id = p_sorteo_id;

  update public.ruleta_configuracion
  set modo = p_modo,
      n_inicial = case when p_modo = 'automatico' then p_n else n_inicial end,
      n_manual = case when p_modo = 'manual' then p_n else null end,
      actualizado_at = now(),
      actualizado_por = p_actor
  where sorteo_id = p_sorteo_id;

  insert into public.sorteo_auditoria (sorteo_id, evento, detalle, actor)
  values (
    p_sorteo_id,
    'configuracion_ruleta',
    jsonb_build_object(
      'modo', p_modo,
      'n', p_n,
      'ventana_desde', v_desde,
      'ventana_hasta', v_hasta,
      'aplica_desde_siguiente_bloque', true
    ),
    p_actor
  );
end;
$$;


-- ── 8. Cola: cancelar confirmaciones y adjuntar el folio del ganador ────────

alter table public.email_outbox
  drop constraint if exists email_outbox_estado_check;
alter table public.email_outbox
  add constraint email_outbox_estado_check
  check (estado in ('pendiente', 'enviando', 'enviado', 'error', 'cancelado'));

update public.email_outbox
set estado = 'cancelado',
    ultimo_error = 'Cancelado por activación de ruleta instantánea'
where tipo = 'confirmacion'
  and estado in ('pendiente', 'enviando', 'error');

drop function if exists public.tomar_lote_email(int);

create function public.tomar_lote_email(lote int default 100)
returns table (
  id bigint,
  inscripcion_id bigint,
  tipo text,
  intentos int,
  nombre text,
  email text,
  sorteo_at timestamptz,
  numero_ganador int
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
         s.ventana_hasta, r.numero_ganador
  from marcadas m
  join public.inscripciones i on i.id = m.inscripcion_id
  left join public.sorteos s on s.id = i.sorteo_id and s.criterio = 'jornada'
  left join public.sorteo_resultados r
    on r.inscripcion_id = i.id and r.numero_ganador is not null
  order by m.id
$$;


-- ── 9. Permisos ─────────────────────────────────────────────────────────────

revoke execute on function public.crear_inscripcion_ruleta(
  text, text, text, text, boolean, boolean, boolean, text, uuid
) from public;
grant execute on function public.crear_inscripcion_ruleta(
  text, text, text, text, boolean, boolean, boolean, text, uuid
) to anon, authenticated;

revoke execute on function public.estado_ruleta_publico()
  from public;
grant execute on function public.estado_ruleta_publico()
  to anon, authenticated;
revoke execute on function public.listar_jornadas_ruleta_publico()
  from public;
grant execute on function public.listar_jornadas_ruleta_publico()
  to anon, authenticated;

revoke execute on function public.estado_ruleta_admin() from public, anon;
revoke execute on function public.listar_ganadores_ruleta() from public, anon;
revoke execute on function public.configurar_ruleta(
  bigint, text, int, timestamp without time zone,
  timestamp without time zone, uuid
) from public, anon;

grant execute on function public.estado_ruleta_admin() to authenticated;
grant execute on function public.listar_ganadores_ruleta() to authenticated;
grant execute on function public.configurar_ruleta(
  bigint, text, int, timestamp without time zone,
  timestamp without time zone, uuid
) to authenticated;

revoke execute on function public.ruleta_n_automatico(bigint, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.proteger_sorteo_instantaneo()
  from public, anon, authenticated;
revoke execute on function public.tomar_lote_email(int)
  from public, anon, authenticated;

notify pgrst, 'reload schema';
