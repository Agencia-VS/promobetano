-- ============================================================================
-- Sorteo: parámetros, pool congelado, resultados y auditoría.
--
-- El modelo está PARAMETRIZADO a propósito. Las decisiones 02 y 03 del brief
-- —¿un sorteo final o sorteos diarios?, ¿cuántos ganadores y suplentes?— no
-- están tomadas, y ninguna se puede inferir del código. En vez de inventar una
-- respuesta, cada sorteo es una fila con su ventana temporal y sus cantidades:
--
--   · un sorteo final  → una fila con ventana_desde/hasta en null.
--   · sorteos diarios  → una fila por jornada con su ventana de 24 h.
--
-- Cuando el cliente responda, se cargan filas. No se toca el esquema.
-- ============================================================================

create table if not exists public.sorteos (
  id            bigint generated always as identity primary key,
  nombre        text not null,

  -- La semilla se registra ANTES de ejecutar y no se vuelve a tocar. Es lo que
  -- convierte el sorteo en auditable: con la semilla y el pool congelado,
  -- cualquiera reproduce el resultado exacto seis meses después.
  semilla       text not null check (length(semilla) >= 16),

  -- Ventana de elegibilidad por fecha de inscripción. null = sin límite.
  ventana_desde timestamptz,
  ventana_hasta timestamptz,

  n_ganadores   int not null check (n_ganadores > 0),
  n_suplentes   int not null default 0 check (n_suplentes >= 0),

  -- Máquina de estados explícita. El paso a 'ejecutando' es un UPDATE
  -- condicional: es lo que hace que el doble clic del admin sea inofensivo.
  estado        text not null default 'borrador'
    check (estado in ('borrador','ejecutando','ejecutado','anulado')),

  creado_at     timestamptz not null default now(),
  ejecutado_at  timestamptz,
  ejecutado_por uuid,

  constraint sorteos_ventana_coherente
    check (ventana_desde is null or ventana_hasta is null
           or ventana_desde < ventana_hasta)
);

-- ----------------------------------------------------------------------------
-- Pool congelado
--
-- La lista completa de participantes en el orden que produjo la semilla, sin
-- PII: solo el id. Es la prueba de que el sorteo se hizo sobre ese universo y
-- no sobre otro. Si el pool se recalculara al auditar, cualquier inscripción
-- posterior o cualquier baja lógica cambiaría el resultado y el sorteo dejaría
-- de reproducir.
-- ----------------------------------------------------------------------------
create table if not exists public.sorteo_pool (
  sorteo_id      bigint not null references public.sorteos(id),
  inscripcion_id bigint not null references public.inscripciones(id),
  orden          int    not null,
  primary key (sorteo_id, orden),
  constraint sorteo_pool_unico unique (sorteo_id, inscripcion_id)
);

-- ----------------------------------------------------------------------------
-- Resultados
--
-- El rol es un ESTADO PERSISTIDO, no un cálculo derivado en el navegador del
-- admin. Promover a un suplente deja rastro de quién ganó y por qué (brief §9):
-- `promovido_desde` apunta a la fila que declinó y `cambiado_at` dice cuándo.
-- ----------------------------------------------------------------------------
create table if not exists public.sorteo_resultados (
  id              bigint generated always as identity primary key,
  sorteo_id       bigint not null references public.sorteos(id),
  inscripcion_id  bigint not null references public.inscripciones(id),
  -- 1..n_ganadores son ganadores; después vienen los suplentes en orden.
  posicion        int not null,
  rol             text not null
    check (rol in ('ganador','suplente','declinado','promovido')),
  promovido_desde bigint references public.sorteo_resultados(id),
  motivo          text,
  creado_at       timestamptz not null default now(),
  cambiado_at     timestamptz,

  constraint sorteo_resultados_unico_por_persona unique (sorteo_id, inscripcion_id),
  constraint sorteo_resultados_unica_posicion    unique (sorteo_id, posicion)
);

create index if not exists sorteo_resultados_sorteo_idx
  on public.sorteo_resultados (sorteo_id, posicion);

-- ----------------------------------------------------------------------------
-- Auditoría append-only
--
-- Nunca se actualiza ni se borra: un registro que se puede reescribir no sirve
-- como prueba. El trigger lo impone en la base, no en la disciplina de quien
-- escriba la próxima consulta.
-- ----------------------------------------------------------------------------
create table if not exists public.sorteo_auditoria (
  id        bigint generated always as identity primary key,
  sorteo_id bigint not null references public.sorteos(id),
  evento    text   not null,
  detalle   jsonb  not null default '{}'::jsonb,
  actor     uuid,
  creado_at timestamptz not null default now()
);

create index if not exists sorteo_auditoria_sorteo_idx
  on public.sorteo_auditoria (sorteo_id, creado_at);

create or replace function public.solo_append()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'La auditoría del sorteo es append-only: no se actualiza ni se borra.';
end;
$$;

drop trigger if exists sorteo_auditoria_append_only on public.sorteo_auditoria;
create trigger sorteo_auditoria_append_only
  before update or delete on public.sorteo_auditoria
  for each row execute function public.solo_append();
