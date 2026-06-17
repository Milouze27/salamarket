import { redirect } from "next/navigation";

export default function Page() {
  redirect("/v2/admin/rapport-mensuel?vue=recap");
}
