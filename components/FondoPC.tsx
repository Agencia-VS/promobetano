import { getImageProps } from "next/image";
import "@/styles/pantalla.css";

/**
 * Key visual de campaña como fondo, solo en escritorio.
 *
 * Va en un <picture> con `getImageProps` y no en un <Image> normal por una
 * razón concreta: el `<source>` lleva `media`, así que en un teléfono el
 * navegador ni siquiera pide el archivo — cae al pixel transparente del <img>.
 * Un <Image> escondido con `display:none` igual se descarga en algunos
 * navegadores, y son 1,4 MB contra el presupuesto de 350 KB de primera carga
 * en la red de un mall.
 *
 * No es `background-image` (regla 12 del brief): pasa por el optimizador, que
 * negocia AVIF o WebP según el Accept del navegador.
 *
 * La opacidad la fija cada pantalla con --fondo-opacidad: la foto es una
 * textura detrás del halo, no una imagen que se mire.
 */

const PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

export function FondoPC() {
  const {
    props: { srcSet, sizes },
  } = getImageProps({
    src: "/brand/FondoparaPC.png",
    alt: "",
    width: 1920,
    height: 1080,
    // Calidad baja a propósito: se ve al 18% de opacidad detrás de un halo.
    quality: 40,
    sizes: "100vw",
  });

  return (
    <div className="fondo-pc" aria-hidden>
      <picture>
        <source media="(min-width: 1024px)" srcSet={srcSet} sizes={sizes} />
        <img src={PIXEL} alt="" decoding="async" fetchPriority="low" />
      </picture>
    </div>
  );
}
