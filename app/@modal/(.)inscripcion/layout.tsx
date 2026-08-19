import { ModalInscripcion } from "@/components/ModalInscripcion";

/**
 * El marco del modal, fuera de la página.
 *
 * Vivía dentro de page.tsx, y eso costaba dos cosas:
 *
 * 1. La página es `force-dynamic` —lee cabeceras y el interruptor del concurso—
 *    así que el prefetch del <Link> no podía traer nada de ella. Al tocar el
 *    botón no aparecía absolutamente nada hasta que el servidor contestaba. En
 *    un layout el marco es estático, entra en lo que el router sí prefetchea, y
 *    se pinta en el mismo frame de la pulsación.
 *
 * 2. Con loading.tsx, el esqueleto y la página son subárboles hermanos de un
 *    Suspense. Si el marco estuviera en los dos, React desmontaría uno y
 *    montaría el otro: la animación de entrada se repetiría, el foco saltaría y
 *    el bloqueo de scroll del cuerpo se soltaría a mitad. Acá arriba se monta
 *    una sola vez y solo cambia lo de dentro.
 */
export default function ModalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ModalInscripcion>{children}</ModalInscripcion>;
}
