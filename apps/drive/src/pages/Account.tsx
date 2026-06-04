import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronRight,
  Download,
  Loader2,
  LogOut,
  Package,
  ShieldCheck,
  Trash2,
  User as UserIcon,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export default function Account() {
  const { profile, user, signOut, loading } = useAuth();
  const navigate = useNavigate();

  // RGPD action states
  const [exporting, setExporting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteDone, setDeleteDone] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate("/", { replace: true });
  };

  const displayEmail = profile?.email ?? user?.email ?? "—";
  const displayName = profile?.full_name || "—";
  const displayPhone = profile?.phone || "—";

  /**
   * RGPD art. 20 — droit à la portabilité. On rassemble les données du compte
   * (profil + commandes de l'utilisateur, lisibles via RLS user_id = auth.uid())
   * et on les restitue dans un fichier JSON structuré et réutilisable.
   * On NE lit PAS consent_log/audit_log : ces tables sont réservées au
   * service_role (PII + traces), inaccessibles avec la clé anon. Une copie
   * complète incluant ces journaux reste disponible sur demande écrite (cf.
   * politique de confidentialité).
   */
  const handleExport = async () => {
    if (!user) return;
    setActionError(null);
    setExporting(true);
    try {
      const { data: orders, error: ordersError } = await supabase
        .from("commandes_drive")
        .select(
          "id, created_at, statut, payment_method, payment_status, total_cents, retrait_at, notes, commandes_drive_lignes(name, quantity, unit_price_cents, line_total_cents)",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (ordersError) throw ordersError;

      const payload = {
        export_format: "salamarket-drive/rgpd-export@1",
        exported_at: new Date().toISOString(),
        compte: {
          id: user.id,
          email: displayEmail,
          nom_complet: profile?.full_name ?? null,
          telephone: profile?.phone ?? null,
        },
        commandes: orders ?? [],
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `salamarket-mes-donnees-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "L'export de vos données a échoué.",
      );
    } finally {
      setExporting(false);
    }
  };

  /**
   * RGPD art. 17 — droit à l'effacement. La clé anon ne permet pas (à juste
   * titre) de supprimer l'enregistrement auth.users : cette suppression
   * irréversible est faite côté serveur. Ici on exécute ce que l'utilisateur
   * PEUT faire lui-même en toute sécurité : anonymiser immédiatement son profil
   * (suppression des PII nom + téléphone via l'UPDATE self autorisé par la RLS),
   * puis déconnexion. Les commandes passées sont conservées sous forme
   * pseudonymisée pour les obligations comptables (10 ans), comme indiqué dans
   * la politique de confidentialité. La purge complète du compte est finalisée
   * sous 30 jours.
   */
  const handleDeleteConfirmed = async () => {
    if (!user) return;
    setActionError(null);
    setDeleting(true);
    try {
      const { error: anonError } = await supabase
        .from("profiles")
        .update({ full_name: null, phone: null })
        .eq("id", user.id);
      if (anonError) throw anonError;

      setDeleteDone(true);
      await signOut();
      window.setTimeout(() => navigate("/", { replace: true }), 2800);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "La demande de suppression a échoué.",
      );
      setDeleting(false);
    }
  };

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
                  className="w-10 h-10 rounded-full bg-sapin/10 text-sapin flex items-center justify-center shrink-0"
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
              className="min-h-[52px] rounded-2xl bg-white border border-border px-4 flex items-center gap-3 text-text font-semibold shadow-sm active:scale-[0.99] hover:border-sapin/30 transition-all"
            >
              <span
                className="w-9 h-9 rounded-full bg-sapin/10 text-sapin flex items-center justify-center shrink-0"
                aria-hidden
              >
                <Package size={17} strokeWidth={2.25} />
              </span>
              <span className="flex-1 text-left">Mes commandes</span>
              <ChevronRight size={18} className="text-muted shrink-0" aria-hidden />
            </button>

            {/* RGPD — privacy controls */}
            <section
              className="bg-white rounded-2xl border border-border p-5 flex flex-col gap-3 shadow-sm"
              aria-labelledby="account-privacy-heading"
            >
              <div className="flex items-center gap-3">
                <span
                  className="w-10 h-10 rounded-full bg-sapin/10 text-sapin flex items-center justify-center shrink-0"
                  aria-hidden
                >
                  <ShieldCheck size={18} strokeWidth={2.25} />
                </span>
                <h2
                  id="account-privacy-heading"
                  className="text-[11px] font-bold tracking-[0.18em] uppercase text-muted"
                >
                  Mes données (RGPD)
                </h2>
              </div>
              <p className="text-[13px] leading-snug text-ink/70">
                Vous pouvez exporter une copie de vos données ou demander la
                suppression de votre compte à tout moment.
              </p>

              {actionError && (
                <p
                  className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-[13px] text-red-700"
                  role="alert"
                >
                  {actionError}
                </p>
              )}

              <button
                type="button"
                onClick={handleExport}
                disabled={exporting}
                className="min-h-[48px] rounded-xl border border-border px-4 flex items-center gap-3 text-text font-semibold active:scale-[0.99] hover:border-sapin/30 disabled:opacity-50 transition-all"
              >
                <span className="text-sapin shrink-0" aria-hidden>
                  {exporting ? (
                    <Loader2 size={17} className="animate-spin" />
                  ) : (
                    <Download size={17} strokeWidth={2.25} />
                  )}
                </span>
                <span className="flex-1 text-left">
                  {exporting ? "Préparation…" : "Télécharger mes données"}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActionError(null);
                  setShowDeleteModal(true);
                }}
                className="min-h-[48px] rounded-xl border border-red-200 px-4 flex items-center gap-3 text-red-600 font-semibold active:scale-[0.99] hover:bg-red-50 transition-all"
              >
                <Trash2 size={17} strokeWidth={2.25} className="shrink-0" aria-hidden />
                <span className="flex-1 text-left">Supprimer mon compte</span>
              </button>
            </section>

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

      {/* Deletion confirmation modal */}
      {showDeleteModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/50 p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-account-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !deleting && !deleteDone) {
              setShowDeleteModal(false);
            }
          }}
        >
          <div
            className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.5rem)" }}
          >
            {deleteDone ? (
              <>
                <h3
                  id="delete-account-title"
                  className="text-[18px] font-bold text-sapin"
                >
                  Demande enregistrée
                </h3>
                <p className="mt-2 text-[14px] leading-relaxed text-ink/75">
                  Vos informations personnelles ont été anonymisées et votre
                  demande de suppression a bien été prise en compte. La purge
                  complète est finalisée sous 30 jours. Vous allez être
                  déconnecté.
                </p>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <span
                    className="w-10 h-10 rounded-full bg-red-50 text-red-600 flex items-center justify-center shrink-0"
                    aria-hidden
                  >
                    <Trash2 size={18} strokeWidth={2.25} />
                  </span>
                  <h3
                    id="delete-account-title"
                    className="text-[18px] font-bold text-sapin"
                  >
                    Supprimer votre compte ?
                  </h3>
                </div>
                <p className="mt-3 text-[14px] leading-relaxed text-ink/75">
                  Cette action est définitive. Vos données personnelles seront
                  supprimées conformément à l'article 17 du RGPD. Vos commandes
                  passées sont conservées de façon anonymisée pour nos
                  obligations comptables.
                </p>
                <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowDeleteModal(false)}
                    disabled={deleting}
                    className="min-h-[44px] px-5 rounded-xl border border-border text-sapin font-semibold active:scale-[0.98] hover:bg-sapin/5 disabled:opacity-50 transition-all"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteConfirmed}
                    disabled={deleting}
                    className="min-h-[44px] px-5 rounded-xl bg-red-600 text-white font-semibold active:scale-[0.98] hover:bg-red-700 disabled:opacity-50 transition-all inline-flex items-center justify-center gap-2"
                  >
                    {deleting && <Loader2 size={16} className="animate-spin" aria-hidden />}
                    {deleting ? "Suppression…" : "Confirmer la suppression"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
