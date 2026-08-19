import type { Metadata } from "next";
import "@/styles/admin.css";

export const metadata: Metadata = {
  title: "Panel — Eau de Confianza",
  // El panel no se indexa jamás: es una superficie interna y su sola presencia
  // en un buscador es información que no hace falta dar.
  robots: { index: false, follow: false },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="adm">{children}</div>;
}
