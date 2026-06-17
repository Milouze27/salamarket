import { redirect } from "next/navigation";

// Page fusionnée dans le centre de Surveillance (onglet DLC).
export default function Page() {
  redirect("/v2/admin/alertes?section=dlc");
}
