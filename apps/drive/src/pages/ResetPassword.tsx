import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";
import { supabase } from "@/integrations/supabase/client";
import { translateAuthError } from "@/lib/authErrors";

/**
 * /reset-password — étape 2 du reset flow.
 *
 * Atteignable seulement via le magic link envoyé par
 * /mot-de-passe-oublie. À l'arrivée, Supabase pose un access_token dans
 * l'URL (#access_token=...) que le client SDK consomme automatiquement
 * pour créer une session "recovery". On vérifie que la session existe
 * avant d'autoriser la saisie du nouveau mot de passe — si quelqu'un
 * arrive ici sans token, on redirige vers /connexion plutôt que
 * d'afficher un formulaire qui échouera.
 *
 * UX :
 *   - Champ password + confirmation (min 8 chars).
 *   - Sur succès : message + redirect /connexion après 2s.
 *   - Si session manquante : message clair + lien vers /mot-de-passe-oublie.
 */
export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [sessionReady, setSessionReady] = useState<boolean | null>(null);

  // Vérifie qu'on a bien une session recovery valide avant d'afficher
  // le formulaire. Supabase JS SDK parse le hash automatiquement au
  // mount — on attend juste qu'il finisse.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        setSessionReady(Boolean(data.session));
      } catch {
        if (!cancelled) setSessionReady(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const valid = password.length >= 8 && password === confirm;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!valid) return;
    setError(null);
    setLoading(true);
    try {
      const { error: sbError } = await supabase.auth.updateUser({ password });
      if (sbError) {
        setError(translateAuthError(sbError));
        return;
      }
      setDone(true);
      // Redirect après 2s — laisse le temps de lire le message succès
      // sans forcer un clic supplémentaire.
      window.setTimeout(() => {
        navigate("/connexion", { replace: true });
      }, 2000);
    } catch (err) {
      setError(translateAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-[#0E3B2E] flex flex-col">
      <AppHeader showBack title="Nouveau mot de passe" />
      <main className="max-w-md mx-auto px-4 py-6 w-full flex-1">
        {sessionReady === null ? (
          <div className="bg-white rounded-3xl p-6 shadow-[0_24px_60px_-30px_rgba(8,42,32,0.45)]">
            <p className="text-sm text-text/60 text-center">Chargement…</p>
          </div>
        ) : sessionReady === false ? (
          <div className="flex flex-col gap-4 bg-white rounded-3xl p-6 shadow-[0_24px_60px_-30px_rgba(8,42,32,0.45)]">
            <h2 className="text-lg font-bold text-text">Lien invalide ou expiré</h2>
            <p className="text-sm text-text/75 leading-relaxed">
              Ce lien de réinitialisation n'est plus valide. Les liens
              expirent au bout d'1 heure et ne peuvent être utilisés qu'une seule fois.
            </p>
            <Link
              to="/mot-de-passe-oublie"
              className="mt-2 min-h-[44px] h-12 rounded-xl bg-[#0E3B2E] hover:bg-[#082A20] text-white font-semibold flex items-center justify-center active:scale-[0.99] transition-all"
            >
              Demander un nouveau lien
            </Link>
            <Link
              to="/connexion"
              className="min-h-[44px] flex items-center justify-center text-center text-sm text-primary underline underline-offset-4"
            >
              Retour à la connexion
            </Link>
          </div>
        ) : done ? (
          <div className="flex flex-col gap-4 bg-white rounded-3xl p-6 shadow-[0_24px_60px_-30px_rgba(8,42,32,0.45)]">
            <h2 className="text-lg font-bold text-text">Mot de passe mis à jour</h2>
            <p className="text-sm text-text/75 leading-relaxed">
              Vous allez être redirigé vers la page de connexion.
            </p>
          </div>
        ) : (
          <form
            onSubmit={onSubmit}
            className="flex flex-col gap-4 bg-white rounded-3xl p-6 shadow-[0_24px_60px_-30px_rgba(8,42,32,0.45)]"
            noValidate
          >
            <p className="text-sm text-text/70 leading-relaxed">
              Choisissez un nouveau mot de passe (8 caractères minimum).
            </p>

            <div className="flex flex-col gap-1">
              <label htmlFor="password" className="text-sm font-medium text-text">
                Nouveau mot de passe
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="min-h-[44px] h-12 px-4 rounded-xl border border-border bg-white text-base text-text focus:outline-none focus:border-primary"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="confirm" className="text-sm font-medium text-text">
                Confirmation
              </label>
              <input
                id="confirm"
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="min-h-[44px] h-12 px-4 rounded-xl border border-border bg-white text-base text-text focus:outline-none focus:border-primary"
              />
              {confirm.length > 0 && password !== confirm && (
                <p className="text-xs text-red-600 mt-1">
                  Les mots de passe ne correspondent pas
                </p>
              )}
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !valid}
              className="min-h-[44px] h-12 rounded-xl bg-[#0E3B2E] hover:bg-[#082A20] text-white font-semibold disabled:opacity-50 active:scale-[0.99] transition-all"
            >
              {loading ? "Mise à jour…" : "Mettre à jour le mot de passe"}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
