-- ============================================================================
-- RLS y permisos.
--
-- Modelo: NINGUNA tabla es accesible directamente desde el cliente. RLS
-- encendida y sin políticas, así que anon y authenticated no leen ni escriben
-- una sola fila por PostgREST. Todo pasa por las RPC `security definer`, que
-- son un puñado de puertas estrechas y auditables en vez de una superficie
-- ancha de tablas.
--
-- Esto NO reemplaza la verificación de sesión en cada handler de
-- /api/admin/** (regla dura 1). La defensa no puede depender de recordar una
-- lista de permisos.
-- ============================================================================

alter table public.inscripciones      enable row level security;
alter table public.email_outbox       enable row level security;
alter table public.sorteos            enable row level security;
alter table public.sorteo_pool        enable row level security;
alter table public.sorteo_resultados  enable row level security;
alter table public.sorteo_auditoria   enable row level security;

-- `force` para que las políticas apliquen también al dueño de la tabla. Sin
-- esto, cualquier consulta que corra como el dueño se salta RLS en silencio.
alter table public.inscripciones      force row level security;
alter table public.email_outbox       force row level security;
alter table public.sorteos            force row level security;
alter table public.sorteo_pool        force row level security;
alter table public.sorteo_resultados  force row level security;
alter table public.sorteo_auditoria   force row level security;

-- Sin políticas a propósito. Una tabla con RLS y cero políticas devuelve cero
-- filas a todo el mundo salvo a quien tenga BYPASSRLS (service_role) o corra
-- dentro de una función security definer.

revoke all on public.inscripciones     from anon, authenticated;
revoke all on public.email_outbox      from anon, authenticated;
revoke all on public.sorteos           from anon, authenticated;
revoke all on public.sorteo_pool       from anon, authenticated;
revoke all on public.sorteo_resultados from anon, authenticated;
revoke all on public.sorteo_auditoria  from anon, authenticated;

-- ----------------------------------------------------------------------------
-- Permisos de las funciones
--
-- Postgres concede EXECUTE a PUBLIC por defecto en toda función nueva. Es el
-- descuido clásico: se escribe una RPC `security definer` para el admin y
-- queda invocable por cualquiera con la clave anónima. Se revoca todo primero
-- y después se concede una por una.
-- ----------------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon, authenticated;

-- Y para las que vengan: sin esto, la próxima migración que agregue una RPC la
-- deja invocable por cualquiera con la clave anónima, y el descuido no aparece
-- en el diff de esa migración sino acá, tres archivos atrás.
alter default privileges in schema public revoke execute on functions from public;

-- Única puerta pública: el alta del formulario.
grant execute on function public.crear_inscripcion(
  text, text, text, text, boolean, boolean, boolean, text
) to anon, authenticated;

-- Lecturas y operaciones del panel. `authenticated` acá es el equipo: este
-- proyecto no tiene cuentas de usuario público (brief §1, fuera de alcance).
grant execute on function public.listar_inscripciones(
  text, text, boolean, timestamptz, bigint, int
) to authenticated;
grant execute on function public.resumen_inscripciones()      to authenticated;
grant execute on function public.resumen_por_panel()          to authenticated;
grant execute on function public.marcar_inelegible(bigint, text) to authenticated;
grant execute on function public.ejecutar_sorteo(bigint, uuid)   to authenticated;
grant execute on function public.promover_suplente(bigint, text, uuid) to authenticated;
grant execute on function public.verificar_sorteo(bigint)     to authenticated;

-- El drenaje de la cola y el webhook de rebotes corren desde el servidor con
-- el service role, que salta RLS: no se conceden a anon ni a authenticated.
-- Quedan listadas para que el revoke de arriba no se lea como un olvido.
--   public.tomar_lote_email(int)
--   public.marcar_email_enviado(bigint, text)
--   public.marcar_email_error(bigint, text)
--   public.rescatar_emails_colgados(interval)
--   public.registrar_evento_email(text, text)

-- ----------------------------------------------------------------------------
-- Realtime: deliberadamente NO configurado.
--
-- El brief lo admite solo en el panel del admin y jamás en una vista pública:
-- son 500 conexiones concurrentes incluidas y una landing de mall las agota en
-- minutos. Además la decisión 08 —si los paneles muestran algo en vivo— sigue
-- abierta, así que no hay nada que suscribir todavía.
--
-- Cuando se abra, va acotado y con su política de SELECT para `authenticated`:
--   alter publication supabase_realtime add table public.inscripciones;
-- ----------------------------------------------------------------------------
