import { useNavigate } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";
import { useAuth } from "@/hooks/useAuth";

export default function Account() {
  const { profile, user, signOut, loading } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-dvh bg-bg pb-20 md:pb-0">
      <AppHeader showBack title="Mon compte" />
      <main className="max-w-md mx-auto px-4 py-6 flex flex-col gap-6">
        {loading ? (
          <p className="text-muted">Chargement…</p>
        ) : (
          <>
            <section className="bg-white rounded-2xl border border-border p-4 flex flex-col gap-3">
              <div>
                <p className="text-xs text-muted">Nom</p>
                <p className="text-text font-medium">
                  {profile?.full_name || "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted">Email</p>
                <p className="text-text">{profile?.email ?? user?.email ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Téléphone</p>
                <p className="text-text">{profile?.phone || "—"}</p>
              </div>
            </section>

            <button
              onClick={() => navigate("/commandes")}
              className="h-12 rounded-xl bg-white border border-border text-text font-medium active:scale-[0.99] transition-transform"
            >
              Mes commandes
            </button>

            <button
              onClick={handleSignOut}
              className="h-12 rounded-xl bg-white border border-red-200 text-red-600 font-semibold active:scale-[0.99] transition-transform"
            >
              Se déconnecter
            </button>
          </>
        )}
      </main>
    </div>
  );
}
