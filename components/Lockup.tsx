/** Wordmark «Eau de Confianza», recoloreable vía CSS mask (sin SVG vectorial todavía — brief §Qué falta 10). */
export function Lockup({
  width,
  height,
  color = "#FFFFFF",
  style,
}: {
  width: number;
  height: number;
  color?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      role="img"
      aria-label="Eau de Confianza"
      style={{
        width,
        height,
        background: color,
        maskImage: "url(/brand/lockup.png)",
        maskSize: "contain",
        maskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskImage: "url(/brand/lockup.png)",
        WebkitMaskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        ...style,
      }}
    />
  );
}

/** Isotipo horizontal de Betano, recoloreable igual que el lockup. */
export function BetanoLogo({
  width,
  height,
  color = "#FFFFFF",
}: {
  width: number;
  height: number;
  color?: string;
}) {
  return (
    <div
      role="img"
      aria-label="Betano"
      style={{
        width,
        height,
        background: color,
        maskImage: "url(/brand/betano-horizontal.png)",
        maskSize: "contain",
        maskRepeat: "no-repeat",
        maskPosition: "left center",
        WebkitMaskImage: "url(/brand/betano-horizontal.png)",
        WebkitMaskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskPosition: "left center",
      }}
    />
  );
}
