import Image from "next/image";

/*
 * Los logos pasaron de CSS `mask-image` a next/image. El mask tenía tres
 * problemas:
 *
 * 1. `background: color` se pinta primero y el mask solo lo recorta, así que si
 *    el PNG fallaba (deploy sin el archivo, mask no soportado) el usuario veía
 *    un RECTÁNGULO BLANCO SÓLIDO sobre el naranja — y `aria-label` seguía
 *    anunciando la marca, de modo que ningún chequeo automático lo detectaba.
 * 2. La URL vivía en un atributo `style` inline, invisible para el preload
 *    scanner: el wordmark es el elemento LCP de la portada y su request no
 *    arrancaba hasta que React montaba el div.
 * 3. Quedaba fuera de next/image, sin AVIF/WebP ni srcset, sirviendo un PNG de
 *    4000px para una caja de 124px.
 *
 * `sizes` declara el ancho real de render para que el optimizador entregue la
 * variante chica y no la intrínseca.
 */

const LOCKUP = { src: "/brand/lockup.png", w: 1245, h: 544 };
const BETANO = { src: "/brand/betano-horizontal.png", w: 4000, h: 1049 };

export function Lockup({
  width,
  priority = false,
  style,
}: {
  width: number;
  priority?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <Image
      src={LOCKUP.src}
      alt="Eau de Confianza"
      width={LOCKUP.w}
      height={LOCKUP.h}
      priority={priority}
      sizes={`${width}px`}
      style={{ width, maxWidth: "100%", height: "auto", ...style }}
    />
  );
}

export function BetanoLogo({ width }: { width: number }) {
  return (
    <Image
      src={BETANO.src}
      alt="Betano"
      width={BETANO.w}
      height={BETANO.h}
      sizes={`${width}px`}
      style={{ width, maxWidth: "100%", height: "auto" }}
    />
  );
}
