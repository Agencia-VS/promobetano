-- ============================================================================
-- Hotfix complementario: el modo de pruebas recorre la lógica real de bloques.
--
-- El ensayo usa el N de la jornada real vigente o próxima, pero mantiene sus
-- bloques, correlativos y correos completamente separados. Un resultado de
-- prueba jamás toca ruleta_global, sorteo_resultados ni el stock 1..90.
-- ============================================================================


-- ── 1. Resultado y bloques aislados del ensayo ──────────────────────────────

alter table public.inscripciones
  add column if not exists ruleta_numero_prueba int;
alter table public.inscripciones
  add column if not exists ruleta_prueba_resuelta_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'inscripciones_ruleta_numero_prueba_valido'
  ) then
    alter table public.inscripciones
      add constraint inscripciones_ruleta_numero_prueba_valido
      check (
        ruleta_numero_prueba is null
        or (es_prueba and ruleta_ganador and ruleta_numero_prueba > 0)
      );
  end if;
end;
$$;

create unique index if not exists inscripciones_ruleta_numero_prueba_key
  on public.inscripciones (sorteo_id, ruleta_numero_prueba)
  where ruleta_numero_prueba is not null;

create table if not exists public.ruleta_prueba_bloques (
  id                     bigint generated always as identity primary key,
  sorteo_id              bigint not null references public.sorteos(id)
                           on delete cascade,
  numero                 int not null check (numero > 0),
  n_aplicado             int not null check (n_aplicado between 1 and 10000),
  posicion_ganadora      int not null,
  posicion_actual        int not null default 0,
  fuente_n               text not null check (fuente_n in ('automatico', 'manual')),
  ganador_inscripcion_id bigint references public.inscripciones(id)
                           on delete set null,
  creado_at              timestamptz not null default now(),
  cerrado_at             timestamptz,
  constraint ruleta_prueba_bloques_posicion_ganadora
    check (posicion_ganadora between 1 and n_aplicado),
  constraint ruleta_prueba_bloques_posicion_actual
    check (posicion_actual between 0 and n_aplicado),
  constraint ruleta_prueba_bloques_unico unique (sorteo_id, numero)
);

create unique index if not exists ruleta_prueba_bloques_uno_abierto_key
  on public.ruleta_prueba_bloques (sorteo_id)
  where cerrado_at is null;

alter table public.inscripciones
  add column if not exists ruleta_prueba_bloque_id bigint
    references public.ruleta_prueba_bloques(id) on delete set null;

create index if not exists inscripciones_ruleta_prueba_bloque_idx
  on public.inscripciones (ruleta_prueba_bloque_id)
  where ruleta_prueba_bloque_id is not null;

alter table public.ruleta_prueba_bloques enable row level security;
alter table public.ruleta_prueba_bloques force row level security;
revoke all on public.ruleta_prueba_bloques from anon, authenticated;
revoke all on sequence public.ruleta_prueba_bloques_id_seq
  from anon, authenticated;


-- ── 2. Resolver una inscripción de prueba con el N real ────────────────────

create or replace function public.resolver_ruleta_prueba(
  p_inscripcion_id bigint
)
returns table (es_ganador boolean, numero_prueba int)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_inscripcion       public.inscripciones%rowtype;
  v_bloque            public.ruleta_prueba_bloques%rowtype;
  v_jornada_prueba    boolean;
  v_fuente_sorteo     bigint;
  v_modo              text := 'automatico';
  v_n_inicial         int := 16;
  v_n_manual          int;
  v_limite            int := 30;
  v_n                 int;
  v_numero_bloque     int;
  v_posicion          int;
  v_gano              boolean := false;
  v_numero            int;
  v_ganadores_prueba  int;
begin
  select * into v_inscripcion
  from public.inscripciones i
  where i.id = p_inscripcion_id
  for update;

  if not found or not v_inscripcion.es_prueba then
    raise exception 'La inscripción % no pertenece al modo de pruebas.',
      p_inscripcion_id using errcode = 'invalid_parameter_value';
  end if;

  -- Un reintento del mismo request_id devuelve la decisión ya persistida y no
  -- avanza dos veces el bloque de ensayo.
  if v_inscripcion.ruleta_prueba_resuelta_at is not null then
    return query select coalesce(v_inscripcion.ruleta_ganador, false),
                        v_inscripcion.ruleta_numero_prueba;
    return;
  end if;

  -- Mutex exclusivo del carril de prueba. No bloquea el bloque real, que usa
  -- ruleta_configuracion como candado, pero serializa dos ensayos simultáneos.
  select s.es_prueba into v_jornada_prueba
  from public.sorteos s
  where s.id = v_inscripcion.sorteo_id
  for update;

  if not found then
    raise exception 'La jornada de la inscripción % no existe.', p_inscripcion_id;
  end if;

  if v_jornada_prueba then
    -- Antes de la apertura, toma la próxima configuración real; después, la
    -- última. Durante una jornada real, abrir el modo global está prohibido.
    select c.sorteo_id, c.modo, c.n_inicial, c.n_manual, c.limite_diario
    into v_fuente_sorteo, v_modo, v_n_inicial, v_n_manual, v_limite
    from public.ruleta_configuracion c
    join public.sorteos s on s.id = c.sorteo_id
    where s.modalidad = 'instantaneo'
      and not s.es_prueba
      and s.estado <> 'anulado'
    order by
      case
        when s.ventana_desde <= now() and s.ventana_hasta > now() then 0
        when s.ventana_desde > now() then 1
        else 2
      end,
      case when s.ventana_desde > now() then s.ventana_desde end asc nulls last,
      case when s.ventana_hasta <= now() then s.ventana_hasta end desc nulls last
    limit 1;
  else
    -- Una identidad del equipo dentro de una jornada real también recorre un
    -- carril aislado, usando exactamente la configuración de esa jornada.
    select c.sorteo_id, c.modo, c.n_inicial, c.n_manual, c.limite_diario
    into v_fuente_sorteo, v_modo, v_n_inicial, v_n_manual, v_limite
    from public.ruleta_configuracion c
    where c.sorteo_id = v_inscripcion.sorteo_id;
  end if;

  -- Un SELECT INTO sin filas deja los destinos en NULL. El ensayo sigue siendo
  -- utilizable mientras el administrador termina de cargar el calendario: usa
  -- los mismos valores seguros que la configuración inicial de la ruleta.
  v_modo := coalesce(v_modo, 'automatico');
  v_n_inicial := coalesce(v_n_inicial, 16);
  v_limite := coalesce(v_limite, 30);

  if v_modo = 'manual' then
    v_n := coalesce(v_n_manual, v_n_inicial, 16);
  elsif v_fuente_sorteo is not null then
    -- Antes de diez observaciones o quince minutos, esta función devuelve el N
    -- inicial; durante la jornada reproduce el N automático realmente vigente.
    v_n := public.ruleta_n_automatico(v_fuente_sorteo, now());
  else
    v_n := 16;
  end if;
  v_n := least(10000, greatest(1, coalesce(v_n, 16)));

  -- purgar_pruebas elimina las inscripciones, pero una identidad de ensayo puede
  -- haber usado el carril aislado de una jornada REAL, que no se borra con la
  -- purga. La primera alta posterior reconoce que ya no quedan resultados de
  -- prueba y limpia esos bloques huérfanos antes de empezar PRUEBA 1 otra vez.
  if not exists (
    select 1
    from public.inscripciones i
    where i.sorteo_id = v_inscripcion.sorteo_id
      and i.es_prueba
      and i.id <> p_inscripcion_id
      and i.ruleta_prueba_resuelta_at is not null
  ) then
    delete from public.ruleta_prueba_bloques b
    where b.sorteo_id = v_inscripcion.sorteo_id;
  end if;

  select count(*)::int into v_ganadores_prueba
  from public.inscripciones i
  where i.sorteo_id = v_inscripcion.sorteo_id
    and i.es_prueba
    and i.ruleta_numero_prueba is not null;

  -- Replica el tope diario, pero en un contador que se borra con la purga y no
  -- modifica ni el stock real ni la secuencia global 1..90.
  if v_ganadores_prueba >= v_limite then
    update public.inscripciones
    set ruleta_ganador = false,
        ruleta_numero_prueba = null,
        ruleta_prueba_resuelta_at = now(),
        ruleta_resuelta_at = now()
    where id = p_inscripcion_id;

    return query select false, null::int;
    return;
  end if;

  select * into v_bloque
  from public.ruleta_prueba_bloques b
  where b.sorteo_id = v_inscripcion.sorteo_id
    and b.cerrado_at is null
  for update;

  if not found then
    select coalesce(max(b.numero), 0) + 1 into v_numero_bloque
    from public.ruleta_prueba_bloques b
    where b.sorteo_id = v_inscripcion.sorteo_id;

    insert into public.ruleta_prueba_bloques (
      sorteo_id, numero, n_aplicado, posicion_ganadora, fuente_n
    ) values (
      v_inscripcion.sorteo_id, v_numero_bloque, v_n,
      floor(random() * v_n)::int + 1, v_modo
    ) returning * into v_bloque;
  end if;

  v_posicion := v_bloque.posicion_actual + 1;
  v_gano := v_posicion = v_bloque.posicion_ganadora;

  if v_gano then
    v_numero := v_ganadores_prueba + 1;

    update public.inscripciones
    set ruleta_ganador = true,
        ruleta_numero_prueba = v_numero,
        ruleta_prueba_bloque_id = v_bloque.id,
        ruleta_prueba_resuelta_at = now(),
        ruleta_resuelta_at = now()
    where id = p_inscripcion_id;

    -- Se procesa por el mismo cron que un ganador real, pero tomar_lote_email
    -- adjunta es_prueba para rotular asunto y correlativo sin ambigüedad.
    insert into public.email_outbox (inscripcion_id, tipo)
    values (p_inscripcion_id, 'ganador')
    on conflict on constraint email_outbox_unico do nothing;
  else
    update public.inscripciones
    set ruleta_ganador = false,
        ruleta_numero_prueba = null,
        ruleta_prueba_bloque_id = v_bloque.id,
        ruleta_prueba_resuelta_at = now(),
        ruleta_resuelta_at = now()
    where id = p_inscripcion_id;
  end if;

  update public.ruleta_prueba_bloques
  set posicion_actual = v_posicion,
      ganador_inscripcion_id = case
        when v_gano then p_inscripcion_id else ganador_inscripcion_id end,
      cerrado_at = case
        when v_posicion >= n_aplicado then now() else cerrado_at end
  where id = v_bloque.id;

  insert into public.sorteo_auditoria (sorteo_id, evento, detalle)
  values (
    v_inscripcion.sorteo_id,
    case when v_gano then 'ganador_prueba_ruleta' else 'resultado_prueba_ruleta' end,
    jsonb_build_object(
      'inscripcion_id', p_inscripcion_id,
      'numero_prueba', v_numero,
      'bloque', v_bloque.numero,
      'n', v_bloque.n_aplicado,
      'posicion', v_posicion,
      'fuente_n', v_bloque.fuente_n,
      'sin_stock_real', true
    )
  );

  return query select v_gano, v_numero;
end;
$$;


-- ── 3. Envolver la RPC real sin duplicar su lógica de stock ─────────────────

alter function public.crear_inscripcion_ruleta(
  text, text, text, text, boolean, boolean, boolean, text, uuid
) rename to crear_inscripcion_ruleta_base;

create function public.crear_inscripcion_ruleta(
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
  v_resultado  text;
  v_id         bigint;
  v_ganador    boolean;
  v_numero     int;
  v_es_prueba  boolean;
  v_sorteo_at  timestamptz;
begin
  select r.resultado, r.inscripcion_id, r.ganador, r.numero_ganador,
         r.es_prueba, r.sorteo_at
  into v_resultado, v_id, v_ganador, v_numero, v_es_prueba, v_sorteo_at
  from public.crear_inscripcion_ruleta_base(
    p_nombre, p_email, p_telefono, p_documento,
    p_declara_edad, p_acepta_bases, p_acepta_marketing, p_origen, p_request_id
  ) r;

  if v_resultado = 'creada' and v_es_prueba and v_id is not null then
    select p.es_ganador, p.numero_prueba
    into v_ganador, v_numero
    from public.resolver_ruleta_prueba(v_id) p;
  end if;

  return query select v_resultado, v_id, coalesce(v_ganador, false),
                      v_numero, coalesce(v_es_prueba, false), v_sorteo_at;
end;
$$;

-- La función SQL de compatibilidad se recrea para que una versión anterior del
-- frontend también pase por el envoltorio y no por el OID renombrado.
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


-- ── 4. El lote identifica los correos y números del ensayo ─────────────────

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
  numero_ganador int,
  es_prueba boolean
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
         s.ventana_hasta,
         case when i.es_prueba then i.ruleta_numero_prueba
              else r.numero_ganador end,
         i.es_prueba
  from marcadas m
  join public.inscripciones i on i.id = m.inscripcion_id
  left join public.sorteos s on s.id = i.sorteo_id and s.criterio = 'jornada'
  left join public.sorteo_resultados r
    on r.inscripcion_id = i.id and r.numero_ganador is not null
  order by m.id
$$;


-- ── 5. Permisos ─────────────────────────────────────────────────────────────

revoke execute on function public.crear_inscripcion_ruleta_base(
  text, text, text, text, boolean, boolean, boolean, text, uuid
) from public, anon, authenticated;
revoke execute on function public.resolver_ruleta_prueba(bigint)
  from public, anon, authenticated;
revoke execute on function public.crear_inscripcion_ruleta(
  text, text, text, text, boolean, boolean, boolean, text, uuid
) from public;
grant execute on function public.crear_inscripcion_ruleta(
  text, text, text, text, boolean, boolean, boolean, text, uuid
) to anon, authenticated;

revoke execute on function public.tomar_lote_email(int)
  from public, anon, authenticated;

notify pgrst, 'reload schema';
