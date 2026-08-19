-- ═══════════════════════════════════════════════════════════════════════════
-- Corrige un duplicado de correo bajo acumulación.
--
-- `rescatar_emails_colgados` recuperaba filas atascadas en 'enviando' —las que
-- deja una instancia serverless que muere entre tomar el lote y cerrarlo—
-- filtrando por `creado_at`:
--
--     where estado = 'enviando' and creado_at < now() - p_antiguedad
--
-- El problema es que `creado_at` dice cuándo se ENCOLÓ la fila, no cuándo se
-- TOMÓ. Una fila encolada hace tres días y tomada hace cinco segundos ya cumple
-- la condición. Como el cron corre cada minuto, en cuanto haya acumulación
-- —el escenario normal si Resend limita el ritmo con 10.000 inscripciones al
-- día— el rescate re-encola filas que están en vuelo y la misma persona recibe
-- el correo dos veces.
--
-- La tabla no tenía ninguna columna que dijera cuándo se tomó una fila, así que
-- no había forma de arreglarlo sin migración.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.email_outbox
  add column if not exists tomado_at timestamptz;

comment on column public.email_outbox.tomado_at is
  'Cuándo tomó esta fila el cron. Lo usa rescatar_emails_colgados para decidir '
  'si el envío está realmente colgado o simplemente en vuelo.';

-- ───────────────────────────────────────────────────────────────────────────
-- tomar_lote_email: idéntica salvo que ahora sella `tomado_at`.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.tomar_lote_email(lote int default 100)
returns table (
  id bigint,
  inscripcion_id bigint,
  tipo text,
  intentos int,
  nombre text,
  email text
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
  select m.id, m.inscripcion_id, m.tipo, m.intentos, i.nombre, i.email
  from marcadas m
  join public.inscripciones i on i.id = m.inscripcion_id
  order by m.id
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- rescatar_emails_colgados: filtra por cuándo se tomó, no por cuándo se creó.
--
-- El `or tomado_at is null` cubre las filas que ya estaban en 'enviando' al
-- aplicar esta migración: no tienen sello, y dejarlas fuera las condenaría a
-- quedarse colgadas para siempre, que es justo lo que esta función existe para
-- evitar. Para esas se conserva el criterio antiguo.
-- ───────────────────────────────────────────────────────────────────────────
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
      and intentos < 6
      and (
        tomado_at < now() - p_antiguedad
        or (tomado_at is null and creado_at < now() - p_antiguedad)
      )
    returning 1
  )
  select count(*)::int from rescatadas
$$;

-- Estas dos funciones corren solo bajo service role (el cron). No se concede
-- execute a nadie más: ver 20260818120600_rls.sql.
revoke execute on function public.tomar_lote_email(int) from public, anon, authenticated;
revoke execute on function public.rescatar_emails_colgados(interval) from public, anon, authenticated;
