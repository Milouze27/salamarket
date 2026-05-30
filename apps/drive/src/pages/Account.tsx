import { useNavigate } from "react-router-dom";
import { ChevronRight, LogOut, Package, User as UserIcon } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { useAuth } from "@/hooks/useAuth";

export default function Account() {
  const { profile, user, signOut, loading } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/", { replace: true });
  };

  const displayEmail = profile?.email ?? user?.email ?? "—";
  const displayName = profile?.full_name || "—";
  const displayPhone = profile?.phone || "—";

  return (
    <div className="min-h-dvh bg-bg pb-20 md:pb-0">
      <AppHeader showBack title="Mon compte" />
      <main className="max-w-md mx-auto px-4 py-6 flex flex-col gap-5">
        {loading ? (
          <ul className="flex flex-col gap-3" aria-busy="true" aria-label="Chargement du compte">
            <li className="h-32 rounded-2xl bg-[linear-gradient(90deg,#E8E4D8_0%,#F2F2EE_50%,#E8E4D8_100%)] bg-[length:200%_100%] animate-skeleton-shimmer" />
            <li className="h-12 rounded-xl bg-[linear-gradient(90deg,#E8E4D8_0%,#F2F2EE_50%,#E8E4D8_100%)] bg-[length:200%_100%] animate-skeleton-shimmer" />
            <li className="h-12 rounded-xl bg-[linear-gradient(90deg,#E8E4D8_0%,#F2F2EE_50%,#E8E4D8_100%)] bg-[length:200%_100%] animate-skeleton-shimmer" />
          </ul>
        ) : (
          <>
            {/* Identity card */}
            <section
              className="bg-white rounded-2xl border border-border p-5 flex flex-col gap-4 shadow-sm"
              aria-labelledby="account-identity-heading"
            >
              <div className="flex items-center gap-3">
                <span
                  className="w-10 h-10 rounded-full bg-[#0E3B2E]/10 text-[#0E3B2E] flex items-center justify-center shrink-0"
                  aria-hidden
                >
                  <UserIcon size={18} strokeWidth={2.25} />
                </span>
                <h2
                  id="account-identity-heading"
                  className="text-[11px] font-bold tracking-[0.18em] uppercase text-muted"
                >
                  Informations
                </h2>
              </div>
              <dl className="flex flex-col gap-3">
                <div>
                  <dt className="text-xs text-muted">Nom</dt>
                  <dd className="text-text font-semibold mt-0.5 break-words">
                    {displayName}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Email</dt>
                  <dd className="text-text font-medium mt-0.5 break-all">
                    {displayEmail}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Téléphone</dt>
                  <dd className="text-text font-medium mt-0.5 break-all tabular-nums">
                    {displayPhone}
                  </dd>
                </div>
              </dl>
            </section>

            {/* Primary action — see orders */}
            <button
              type="button"
              onClick={() => navigate("/commandes")}
              className="min-h-[52px] rounded-2xl bg-white border border-border px-4 flex items-center gap-3 text-text font-semibold shadow-sm active:scale-[0.99] hover:border-[#0E3B2E]/30 transition-all"
            >
              <span
                className="w-9 h-9 rounded-full bg-[#0E3B2E]/10 text-[#0E3B2E] flex items-center justify-center shrink-0"
                aria-hidden
              >
                <Package size={17} strokeWidth={2.25} />
              </span>
              <span className="flex-1 text-left">Mes commandes</span>
              <ChevronRight size={18} className="text-muted shrink-0" aria-hidden />
            </button>

            {/* Destructive — sign out, visually separated */}
            <button
              type="button"
              onClick={handleSignOut}
              className="mt-2 min-h-[52px] rounded-2xl bg-white border border-red-200 px-4 flex items-center justify-center gap-2 text-red-600 font-semibold active:scale-[0.99] hover:bg-red-50 transition-all"
            >
              <LogOut size={17} strokeWidth={2.25} aria-hidden />
              Se déconnecter
            </button>
          </>
        )}
      </main>
    </div>
  );
}
