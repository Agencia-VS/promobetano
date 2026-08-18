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
 */

export type HaloVariant = "portada" | "formulario" | "listo";

type HaloConfig = {
  top: number;
  size: number;
  rings: string;
  overlay: string;
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
  },
};

export function Halo({ variant }: { variant: HaloVariant }) {
  const cfg = HALOS[variant];
  return (
    <>
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: cfg.top,
          left: "50%",
          transform: "translateX(-50%)",
          width: cfg.size,
          height: cfg.size,
          background: cfg.rings,
        }}
      />
      {cfg.glow && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: -60,
            left: "50%",
            transform: "translateX(-50%)",
            width: 540,
            height: 540,
            background:
              "radial-gradient(circle, rgba(226,51,0,.9) 0 34%, rgba(255,57,0,0) 72%)",
          }}
        />
      )}
      <div
        aria-hidden
        style={{ position: "absolute", inset: 0, background: cfg.overlay }}
      />
    </>
  );
}
