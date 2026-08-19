import type { CSSProperties } from "react";
import "@/styles/pantalla.css";

/**
 * El anillo de fondo de la campaña: CSS puro, cero bytes, reemplazo del
 * FONDO.png de 2,1 MB.
 *
 * Una sola tabla de configuración en vez de tres Record paralelos más un
 * condicional inline: antes agregar una pantalla eran seis ediciones
 * coordinadas y TypeScript solo cazaba tres.
 *
 * El `filter: blur()` se quitó a propósito. Sobre una caja de 700px forzaba
 * una superficie offscreen de ~21 MB a DPR3, rasterizada antes del primer
 * paint de la landing del QR, y no aportaba nada: los stops ya describen
 * rampas de 28–49px, así que no hay banding que suavizar. En su lugar los
 * stops se ensancharon.
 *
 * La posición y el tamaño salen por custom properties en vez de por estilo
 * inline directo: en escritorio el anillo se recentra detrás de la columna de
 * marca y crece con el viewport, y eso son medias que solo el CSS puede
 * expresar (styles/pantalla.css).
 */

export type HaloVariant = "portada" | "formulario" | "listo";

type HaloConfig = {
  top: number;
  size: number;
  rings: string;
  overlay: string;
  /** Velo de escritorio: en dos columnas la rampa corre en diagonal, no de
      arriba abajo, para no lavar el lado donde va el panel de acción. */
  overlayLg: string;
  /** Resplandor central; solo la portada lo lleva. */
  glow?: boolean;
};

export const HALOS: Record<HaloVariant, HaloConfig> = {
  portada: {
    top: -120,
    size: 700,
    rings:
      "radial-gradient(circle, transparent 0 27%, rgba(60,0,0,.5) 33%, transparent 40%)," +
      "radial-gradient(circle, transparent 0 42%, rgba(10,6,5,.42) 49%, transparent 58%)," +
      "radial-gradient(circle, transparent 0 60%, rgba(60,0,0,.3) 68%, transparent 78%)",
    overlay:
      "linear-gradient(180deg, rgba(255,57,0,0) 0%, rgba(226,51,0,.35) 62%, rgba(179,38,0,.6) 100%)",
    // Con la foto al 90% el velo cambia de trabajo: ya no da profundidad a un
    // naranja plano, sino que asienta el lado izquierdo —donde va el titular en
    // blanco— y se retira antes de llegar a la figura, para no ensuciarla.
    overlayLg:
      "linear-gradient(90deg, rgba(10,6,5,.26) 0%, rgba(10,6,5,.08) 36%, rgba(255,57,0,0) 60%)",
    glow: true,
  },
  formulario: {
    top: -430,
    size: 700,
    rings:
      "radial-gradient(circle, transparent 0 42%, rgba(60,0,0,.4) 49%, transparent 58%)," +
      "radial-gradient(circle, transparent 0 60%, rgba(10,6,5,.3) 68%, transparent 78%)",
    overlay:
      "linear-gradient(180deg, rgba(255,57,0,0) 0%, rgba(226,51,0,.3) 70%, rgba(179,38,0,.5) 100%)",
    overlayLg:
      "linear-gradient(115deg, rgba(255,57,0,0) 0%, rgba(226,51,0,.26) 62%, rgba(179,38,0,.46) 100%)",
  },
  listo: {
    top: -190,
    size: 660,
    rings:
      "radial-gradient(circle, transparent 0 27%, rgba(60,0,0,.45) 33%, transparent 40%)," +
      "radial-gradient(circle, transparent 0 42%, rgba(10,6,5,.35) 49%, transparent 58%)," +
      "radial-gradient(circle, transparent 0 60%, rgba(60,0,0,.28) 68%, transparent 78%)",
    overlay:
      "linear-gradient(180deg, rgba(255,57,0,0) 0%, rgba(226,51,0,.3) 65%, rgba(179,38,0,.55) 100%)",
    overlayLg:
      "linear-gradient(90deg, rgba(10,6,5,.22) 0%, rgba(10,6,5,.06) 40%, rgba(255,57,0,0) 66%)",
  },
};

export function Halo({ variant }: { variant: HaloVariant }) {
  const cfg = HALOS[variant];
  const vars = {
    "--halo-top": `${cfg.top}px`,
    "--halo-size": `${cfg.size}px`,
    "--halo-velo": cfg.overlay,
    "--halo-velo-lg": cfg.overlayLg,
  } as CSSProperties;

  return (
    <div aria-hidden style={vars}>
      <div className="halo__anillos" style={{ background: cfg.rings }} />
      {cfg.glow && <div className="halo__brillo" />}
      <div className="halo__velo" />
    </div>
  );
}
