import type { Metadata, Viewport } from "next";
import { mdNichrome, haffer } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Eau de Confianza — Betano x Cristián Riquelme",
  description:
    "Hay un aroma para el momento en que decides confiar en ti. Inscríbete y entra al sorteo.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${mdNichrome.variable} ${haffer.variable}`}>
      <body>{children}</body>
    </html>
  );
}
