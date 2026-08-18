type HaloVariant = "portada" | "formulario" | "listo";

const RING_LAYER: Record<HaloVariant, string> = {
  portada:
    "radial-gradient(circle, transparent 0 30%, rgba(60,0,0,.5) 33%, transparent 37%)," +
    "radial-gradient(circle, transparent 0 45%, rgba(10,6,5,.42) 49%, transparent 55%)," +
    "radial-gradient(circle, transparent 0 63%, rgba(60,0,0,.3) 68%, transparent 75%)",
  formulario:
    "radial-gradient(circle, transparent 0 45%, rgba(60,0,0,.4) 49%, transparent 55%)," +
    "radial-gradient(circle, transparent 0 63%, rgba(10,6,5,.3) 68%, transparent 75%)",
  listo:
    "radial-gradient(circle, transparent 0 30%, rgba(60,0,0,.45) 33%, transparent 37%)," +
    "radial-gradient(circle, transparent 0 45%, rgba(10,6,5,.35) 49%, transparent 55%)," +
    "radial-gradient(circle, transparent 0 63%, rgba(60,0,0,.28) 68%, transparent 75%)",
};

const RING_BOX: Record<HaloVariant, { top: number; size: number }> = {
  portada: { top: -120, size: 700 },
  formulario: { top: -430, size: 700 },
  listo: { top: -190, size: 660 },
};

const OVERLAY: Record<HaloVariant, string> = {
  portada:
    "linear-gradient(180deg, rgba(255,57,0,0) 0%, rgba(226,51,0,.35) 62%, rgba(179,38,0,.6) 100%)",
  formulario:
    "linear-gradient(180deg, rgba(255,57,0,0) 0%, rgba(226,51,0,.3) 70%, rgba(179,38,0,.5) 100%)",
  listo:
    "linear-gradient(180deg, rgba(255,57,0,0) 0%, rgba(226,51,0,.3) 65%, rgba(179,38,0,.55) 100%)",
};

/**
 * El anillo de fondo — CSS puro, cero bytes, reemplazo directo de FONDO.png
 * (brief §El halo es CSS, no una imagen). Solo la portada lleva el resplandor
 * central de más abajo.
 */
export function Halo({ variant }: { variant: HaloVariant }) {
  const ring = RING_BOX[variant];
  return (
    <>
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: ring.top,
          left: "50%",
          transform: "translateX(-50%)",
          width: ring.size,
          height: ring.size,
          background: RING_LAYER[variant],
          filter: "blur(16px)",
        }}
      />
      {variant === "portada" && (
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
        style={{ position: "absolute", inset: 0, background: OVERLAY[variant] }}
      />
    </>
  );
}
