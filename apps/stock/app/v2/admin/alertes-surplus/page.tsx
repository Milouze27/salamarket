import { redirect } from "next/navigation";

// Page fusionnée dans l'onglet « Surplus » du centre d'alertes.
// On conserve la route pour ne pas casser d'anciens liens : redirection
// serveur permanente vers /v2/admin/alertes?tab=surplus.
export default function Page() {
  redirect("/v2/admin/alertes?tab=surplus");
}
