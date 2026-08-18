import localFont from "next/font/local";

/*
 * Las tres familias se sirven localmente, sin Google Fonts, y subseteadas a
 * latín + puntuación tipográfica (el copy es español): 215 KB de originales
 * pasaron a 76 KB. Haffer venía como TTF crudo de 148 KB porque
 * next/font/local no transcodifica ni subsetea — solo next/font/google lo hace.
 *
 * Los dos cortes de MD Nichrome son deliberados y siguen el sistema
 * tipográfico del brief: Dark (800) para titulares, botones y cifras; Regular
 * (400) para etiquetas y antetítulos.
 *
 * Nunca se pide la familia por su nombre literal: en el repo anterior
 * `font-family: 'MDNichrome'` con weight 800 hacía que el navegador sintetizara
 * la negrita desde el corte Regular en vez de usar el Dark, y el fallback era
 * `serif`, que mostraba Times en una caída de red.
 */
export const mdNichrome = localFont({
  src: [
    { path: "./fonts/MDNichrome-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/MDNichrome-Dark.woff2", weight: "800", style: "normal" },
  ],
  variable: "--font-mdn",
  display: "swap",
});

export const haffer = localFont({
  src: [{ path: "./fonts/Haffer-Regular.woff2", weight: "400", style: "normal" }],
  variable: "--font-haffer",
  display: "swap",
});
