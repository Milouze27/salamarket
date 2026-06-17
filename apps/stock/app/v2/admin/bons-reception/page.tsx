import { redirect } from "next/navigation";

/* Les archives BR ont fusionné dans la page Achats à onglets. */
export default function Page() {
  redirect("/v2/fournisseurs?tab=receptions");
}
