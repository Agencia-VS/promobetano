import type { Metadata, Viewport } from "next";
import { mdNichrome, haffer } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Eau de Confianza — Betano x Cristián Riquelme",
  description:
    "Hay un aroma para el momento en que decides confiar en ti. Inscríbete y entra al sorteo.",
  icons: {
    icon: "/brand/isoBetano.png",
    apple: "/brand/isoBetano.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/**
 * `modal` es una ranura paralela: la llena app/@modal/(.)inscripcion cuando se
 * navega a /inscripcion desde dentro del sitio, y app/@modal/default.tsx —que
 * no pinta nada— en cualquier otro caso.
 */
export default function RootLayout({
  children,
  modal,
}: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${mdNichrome.variable} ${haffer.variable}`}>
      {/*
        Extensiones de navegador (Grammarly, ColorZilla) inyectan atributos en
        <body> antes de que React hidrate y eso dispara un error de hidratación
        en cada carga. suppressHydrationWarning solo silencia este nodo: las
        diferencias reales dentro de children se siguen reportando.
      */}
      <body suppressHydrationWarning>
        {children}
        {modal}
      </body>
    </html>
  );
}
