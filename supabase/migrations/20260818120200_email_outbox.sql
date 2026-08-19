-- ============================================================================
-- Cola de correo.
--
-- Ningún correo se envía dentro del request de inscripción (regla dura 8). En
-- el pico de una activación de mall el request queda esperando a la API del
-- proveedor: si Resend tarda 800 ms, la persona ve el spinner 800 ms de más, y
-- si Resend falla, la inscripción se pierde entera por un correo que se podía
-- reintentar. Acá se encola, y un cron lo drena por lotes.
-- ============================================================================

create table if not exists public.email_outbox (
  id             bigint generated always as identity primary key,
  inscripcion_id bigint not null references public.inscripciones(id),
  tipo           text not null
    check (tipo in ('confirmacion','ganador','suplente','promovido')),

  estado         text not null default 'pendiente'
    check (estado in ('pendiente','enviando','enviado','error')),
  intentos       int  not null default 0,
  -- Backoff: el drenaje solo toma filas cuya espera ya venció. Sin esto, una
  -- fila que falla de forma permanente se reintenta en cada corrida del cron y
  -- consume el lote entero mientras las nuevas esperan detrás.
  disponible_at  timestamptz not null default now(),
  ultimo_error   text,
  proveedor_id   text,

  creado_at      timestamptz not null default now(),
  enviado_at     timestamptz,

  -- Encolar dos veces no duplica correo (brief §9). Es la red que hace que un
  -- reintento del formulario, un doble submit o un redespliegue del cron sean
  -- inofensivos.
  constraint email_outbox_unico unique (inscripcion_id, tipo)
);

-- Índice parcial sobre lo pendiente: la cola drenada queda enorme y lo único
-- que el cron consulta son las pocas filas que aún esperan.
create index if not exists email_outbox_pendientes_idx
  on public.email_outbox (disponible_at, id)
  where estado in ('pendiente','error');

-- ----------------------------------------------------------------------------
-- Toma de lote
--
-- `for update skip locked` es el corazón: dos corridas del cron que se solapen
-- —o dos instancias serverless -— toman filas distintas en vez de pelear por
-- la misma y mandar el correo dos veces. Sin skip locked la segunda se queda
-- bloqueada esperando a la primera y el cron se cae por timeout.
--
-- El lote es 100 por corrida. Marca 'enviando' en la misma transacción en que
-- las reserva, así que una fila en vuelo no se vuelve a tomar aunque el
-- proceso muera: queda visible en 'enviando' para que la rescate un barrido.
-- ----------------------------------------------------------------------------
create or replace function public.tomar_lote_email(lote int default 100)
returns table (
  id             bigint,
  inscripcion_id bigint,
  tipo           text,
  intentos       int,
  nombre         text,
  email          text
)
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  with tomadas as (
    select o.id
    from public.email_outbox o
    where o.estado in ('pendiente','error')
      and o.disponible_at <= now()
    order by o.disponible_at, o.id
    limit least(greatest(lote, 1), 500)
    for update skip locked
  ),
  marcadas as (
    update public.email_outbox o
    set estado = 'enviando', intentos = o.intentos + 1
    from tomadas t
    where o.id = t.id
    returning o.id, o.inscripcion_id, o.tipo, o.intentos
  )
  select m.id, m.inscripcion_id, m.tipo, m.intentos, i.nombre, i.email
  from marcadas m
  join public.inscripciones i on i.id = m.inscripcion_id
  order by m.id
$$;

/** Cierre exitoso de un envío. `proveedor` es el id de Resend, para trazar rebotes. */
create or replace function public.marcar_email_enviado(
  p_id bigint,
  p_proveedor_id text
)
returns void
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  update public.email_outbox
  set estado = 'enviado', enviado_at = now(), proveedor_id = p_proveedor_id,
      ultimo_error = null
  where id = p_id
$$;

/**
 * Cierre fallido. El backoff crece con los intentos y se corta a las 6
 * tentativas: más allá el problema no es transitorio y hay que mirarlo, no
 * seguir golpeando la API del proveedor.
 */
create or replace function public.marcar_email_error(
  p_id bigint,
  p_error text
)
returns void
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  update public.email_outbox
  set estado = case when intentos >= 6 then 'error' else 'pendiente' end,
      ultimo_error = left(p_error, 500),
      disponible_at = now() + (least(intentos, 6) * interval '5 minutes')
  where id = p_id
$$;

/**
 * Rescate de envíos colgados: una instancia serverless que muere entre
 * `tomar_lote_email` y el cierre deja la fila en 'enviando' para siempre. El
 * cron llama a esto antes de tomar lote.
 */
create or replace function public.rescatar_emails_colgados(
  p_antiguedad interval default interval '15 minutes'
)
returns int
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  with rescatadas as (
    update public.email_outbox
    set estado = 'pendiente', disponible_at = now()
    where estado = 'enviando'
      and creado_at < now() - p_antiguedad
      and intentos < 6
    returning 1
  )
  select count(*)::int from rescatadas
$$;

/**
 * Webhook de Resend: rebote o queja. Marca la inscripción y —esto es lo que
 * cierra el ciclo— la deja fuera del sorteo. Un ganador cuyo correo rebota no
 * se entera de que ganó, y el premio queda sin entregar con el sorteo ya
 * hecho.
 */
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
begin
  v_estado := case p_evento
    when 'delivered' then 'entregado'
    when 'bounced'   then 'rebote'
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

  update public.inscripciones
  set email_estado = v_estado
  where id = v_inscripcion;
end;
$$;
