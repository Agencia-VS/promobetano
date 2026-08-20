-- ============================================================================
-- Panel y tendencia independientes para la ruleta de pruebas.
--
-- El ensayo conserva la misma mecánica que producción, pero su modo, N,
-- ventana, bloques, contadores y tope viven en un carril separado. Cambiar esta
-- fila jamás modifica ruleta_configuracion, ruleta_bloques, ruleta_global ni los
-- folios reales 1..90.
-- ============================================================================


-- ── 1. Configuración única del simulador ───────────────────────────────────

create table if not exists public.ruleta_prueba_configuracion (
  id               smallint primary key default 1 check (id = 1),
  modo             text not null default 'automatico'
    check (modo in ('automatico', 'manual')),
  n_inicial        int not null default 8 check (n_inicial between 1 and 10000),
  n_manual         int check (n_manual between 1 and 10000),
  limite_diario    int not null default 30 check (limite_diario between 1 and 30),
  ventana_desde    timestamptz not null,
  ventana_hasta    timestamptz not null,
  actualizado_at   timestamptz not null default now(),
  actualizado_por  uuid,
  constraint ruleta_prueba_configuracion_manual_con_n
    check (modo <> 'manual' or n_manual is not null),
  constraint ruleta_prueba_configuracion_ventana_valida
    check (ventana_desde < ventana_hasta)
);

-- Al instalar, toma como punto de partida el modo, N y ventana de la jornada
-- real más cercana. Desde ese instante ambos carriles quedan separados.
insert into public.ruleta_prueba_configuracion (
  id, modo, n_inicial, n_manual, limite_diario,
  ventana_desde, ventana_hasta
)
select
  1,
  coalesce(origen.modo, 'automatico'),
  coalesce(origen.n_inicial, 8),
  case
    when origen.modo = 'manual'
      then coalesce(origen.n_manual, origen.n_inicial, 8)
    else null
  end,
  30,
  coalesce(origen.ventana_desde, date_trunc('minute', now())),
  coalesce(
    origen.ventana_hasta,
    date_trunc('minute', now()) + interval '1 hour'
  )
from (values (1)) as semilla(id)
left join lateral (
  select c.modo, c.n_inicial, c.n_manual,
         s.ventana_desde, s.ventana_hasta
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
  limit 1
) origen on true
on conflict (id) do nothing;

comment on table public.ruleta_prueba_configuracion is
  'Configuración singleton del simulador. No consume ni altera stock real.';

alter table public.ruleta_prueba_configuracion enable row level security;
alter table public.ruleta_prueba_configuracion force row level security;
revoke all on public.ruleta_prueba_configuracion from public, anon, authenticated;


-- ── 2. N automático calculado solo con observaciones de prueba ─────────────

create or replace function public.ruleta_n_prueba_automatico(
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
  v_desde        timestamptz;
  v_hasta        timestamptz;
  v_n_inicial    int;
  v_limite       int;
  v_ganadores    int;
  v_participan   int;
  v_transcurrido numeric;
  v_restante     numeric;
  v_estimadas    numeric;
  v_premios      int;
begin
  select c.ventana_desde, c.ventana_hasta, c.n_inicial, c.limite_diario
  into v_desde, v_hasta, v_n_inicial, v_limite
  from public.ruleta_prueba_configuracion c
  where c.id = 1;

  if not found then return 8; end if;

  select count(*)::int into v_ganadores
  from public.inscripciones i
  where i.sorteo_id = p_sorteo_id
    and i.es_prueba
    and i.ruleta_numero_prueba is not null;

  v_premios := greatest(v_limite - v_ganadores, 0);
  if v_premios = 0 then return 1; end if;

  select count(*)::int into v_participan
  from public.inscripciones i
  where i.sorteo_id = p_sorteo_id
    and i.es_prueba
    and i.ruleta_prueba_resuelta_at is not null;

  v_transcurrido := greatest(
    extract(epoch from (p_instante - v_desde)),
    60
  );
  v_restante := greatest(extract(epoch from (v_hasta - p_instante)), 0);

  -- Igual que producción: antes de diez muestras o quince minutos todavía no
  -- hay una tasa confiable y se conserva el N inicial del simulador.
  if v_participan < 10 or v_transcurrido < 900 then
    return v_n_inicial;
  end if;

  v_estimadas := least(
    (v_participan::numeric / v_transcurrido) * v_restante,
    greatest((v_n_inicial * v_limite) - v_participan, 0)
  );

  return least(
    10000,
    greatest(1, floor(v_estimadas / v_premios)::int)
  );
end;
$$;


-- ── 3. Resolver de prueba conectado exclusivamente al simulador ────────────

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
  v_config            public.ruleta_prueba_configuracion%rowtype;
  v_bloque            public.ruleta_prueba_bloques%rowtype;
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

  -- Un reintento del mismo request_id devuelve la decisión persistida sin
  -- avanzar dos veces el bloque.
  if v_inscripcion.ruleta_prueba_resuelta_at is not null then
    return query select coalesce(v_inscripcion.ruleta_ganador, false),
                        v_inscripcion.ruleta_numero_prueba;
    return;
  end if;

  -- Conserva vivo el sorteo y serializa la purga/cambio de jornada mientras se
  -- resuelve esta alta.
  perform 1
  from public.sorteos s
  where s.id = v_inscripcion.sorteo_id
  for update;

  if not found then
    raise exception 'La jornada de la inscripción % no existe.', p_inscripcion_id;
  end if;

  -- Esta fila es el mutex del carril de pruebas. La ruta de configuración
  -- actualiza la misma fila, por lo que un cambio simultáneo queda claramente
  -- antes o después de la apertura del próximo bloque.
  select * into v_config
  from public.ruleta_prueba_configuracion c
  where c.id = 1
  for update;

  if not found then
    raise exception 'No existe la configuración de la ruleta de pruebas.';
  end if;

  if v_config.modo = 'manual' then
    v_n := coalesce(v_config.n_manual, v_config.n_inicial, 8);
  else
    v_n := public.ruleta_n_prueba_automatico(
      v_inscripcion.sorteo_id,
      now()
    );
  end if;
  v_n := least(10000, greatest(1, coalesce(v_n, 8)));

  -- purgar_pruebas elimina las inscripciones. Si el ensayo usó una jornada
  -- REAL, sus bloques no caen por cascada; la primera alta posterior los limpia
  -- para volver a comenzar en PRUEBA 1 y bloque 1.
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

  if v_ganadores_prueba >= v_config.limite_diario then
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
      v_inscripcion.sorteo_id,
      v_numero_bloque,
      v_n,
      floor(random() * v_n)::int + 1,
      v_config.modo
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
      'configuracion_independiente', true,
      'sin_stock_real', true
    )
  );

  return query select v_gano, v_numero;
end;
$$;


-- ── 4. Estado y edición para el panel de administración ────────────────────

create or replace function public.estado_ruleta_pruebas_admin()
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
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_config      public.ruleta_prueba_configuracion%rowtype;
  v_sorteo      bigint;
  v_bloque      public.ruleta_prueba_bloques%rowtype;
  v_inscritos   int := 0;
  v_ganadores   int := 0;
  v_n_siguiente int;
begin
  select * into v_config
  from public.ruleta_prueba_configuracion c
  where c.id = 1;

  if not found then return; end if;

  -- Primero la jornada de ensayo activa; durante el evento, la jornada real
  -- activa donde entra la identidad del equipo; si ninguna está corriendo, la
  -- última que tenga observaciones de prueba para poder revisar el smoke test.
  select s.id into v_sorteo
  from public.sorteos s
  where (s.es_prueba or s.modalidad = 'instantaneo')
    and (
      (s.ventana_desde <= now() and s.ventana_hasta > now())
      or exists (
        select 1 from public.inscripciones i
        where i.sorteo_id = s.id and i.es_prueba
      )
    )
  order by
    case
      when s.es_prueba
       and s.ventana_desde <= now() and s.ventana_hasta > now() then 0
      when s.ventana_desde <= now() and s.ventana_hasta > now() then 1
      else 2
    end,
    coalesce(
      (select max(i.creado_at) from public.inscripciones i
       where i.sorteo_id = s.id and i.es_prueba),
      s.ventana_desde
    ) desc
  limit 1;

  if v_sorteo is not null then
    select count(*)::int,
           (count(*) filter (where i.ruleta_numero_prueba is not null))::int
    into v_inscritos, v_ganadores
    from public.inscripciones i
    where i.sorteo_id = v_sorteo and i.es_prueba;

    -- No se muestra un bloque huérfano que haya quedado en una jornada real
    -- después de purgar todas sus inscripciones de prueba.
    if v_inscritos > 0 then
      select * into v_bloque
      from public.ruleta_prueba_bloques b
      where b.sorteo_id = v_sorteo and b.cerrado_at is null;
    end if;
  end if;

  v_n_siguiente := case
    when v_config.modo = 'manual'
      then coalesce(v_config.n_manual, v_config.n_inicial)
    when v_sorteo is not null
      then public.ruleta_n_prueba_automatico(v_sorteo, now())
    else v_config.n_inicial
  end;

  return query select
    v_sorteo,
    'pruebas'::text,
    'Sorteo de pruebas'::text,
    v_config.ventana_desde,
    v_config.ventana_hasta,
    v_config.ventana_desde <= now() and v_config.ventana_hasta > now(),
    v_config.modo,
    v_config.n_inicial,
    v_config.n_manual,
    coalesce(v_bloque.n_aplicado, v_n_siguiente),
    v_n_siguiente,
    v_bloque.numero,
    v_bloque.posicion_actual,
    v_bloque.n_aplicado,
    v_inscritos,
    v_ganadores,
    v_config.limite_diario,
    v_ganadores,
    v_config.limite_diario;
end;
$$;

create or replace function public.configurar_ruleta_pruebas(
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

  update public.ruleta_prueba_configuracion
  set modo = p_modo,
      n_inicial = case when p_modo = 'automatico' then p_n else n_inicial end,
      n_manual = case when p_modo = 'manual' then p_n else null end,
      ventana_desde = v_desde,
      ventana_hasta = v_hasta,
      actualizado_at = now(),
      actualizado_por = p_actor
  where id = 1;

  if not found then
    insert into public.ruleta_prueba_configuracion (
      id, modo, n_inicial, n_manual, limite_diario,
      ventana_desde, ventana_hasta, actualizado_por
    ) values (
      1,
      p_modo,
      case when p_modo = 'automatico' then p_n else 8 end,
      case when p_modo = 'manual' then p_n else null end,
      30,
      v_desde,
      v_hasta,
      p_actor
    );
  end if;
end;
$$;


-- ── 5. Permisos ─────────────────────────────────────────────────────────────

revoke execute on function public.ruleta_n_prueba_automatico(bigint, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.resolver_ruleta_prueba(bigint)
  from public, anon, authenticated;
revoke execute on function public.estado_ruleta_pruebas_admin()
  from public, anon;
revoke execute on function public.configurar_ruleta_pruebas(
  text, int, timestamp without time zone, timestamp without time zone, uuid
) from public, anon;

grant execute on function public.estado_ruleta_pruebas_admin()
  to authenticated;
grant execute on function public.configurar_ruleta_pruebas(
  text, int, timestamp without time zone, timestamp without time zone, uuid
) to authenticated;

notify pgrst, 'reload schema';
