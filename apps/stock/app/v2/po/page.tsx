import { redirect } from "next/navigation";

/* La liste des commandes fournisseurs a fusionné dans la page Achats à
 * onglets. Le détail /v2/po/[id] reste intact. */
export default function Page() {
  redirect("/v2/fournisseurs?tab=commandes");
}
