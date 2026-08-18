import { redirect } from "next/navigation";

// El flujo real entra por /i?p={{slug}} desde el QR del panel (brief §Flujo
// desde el QR). La raíz no tiene pantalla propia.
export default function RootPage() {
  redirect("/i");
}
