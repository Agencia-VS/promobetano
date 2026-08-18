"use client";

import { useEffect } from "react";
import { guardaOrigen } from "@/lib/origen";

/** Efecto puro: deja el slug del panel en cookie para que sobreviva la navegación a /inscripcion. */
export function PersistOrigen({ slug }: { slug: string }) {
  useEffect(() => {
    guardaOrigen(slug);
  }, [slug]);
  return null;
}
