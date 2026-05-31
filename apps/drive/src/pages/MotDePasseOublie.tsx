import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";
import { supabase } from "@/integrations/supabase/client";
import { translateAuthError } from "@/lib/authErrors";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * /mot-de-passe-oublie — étape 1 du reset flow.
 *
 * Envoie un magic link via supabase.auth.resetPasswordForEmail. Le
 * redirectTo pointe vers /reset-password (étape 2) où l'utilisateur
 * choisira son nouveau mot de passe — la session Supabase est posée
 * en cookie par le lien de redirection, donc updateUser fonctionne
 * directement à l'arrivée sur /reset-password.
 *
 * UX :
 *   - 1 seul champ email + bouton "Envoyer le lien".
 *   - Anti double-submit identique à Login/Signup (BUG-001).
 *   - Si succès on affiche un état "Email envoyé" plutôt que de
 *     rediriger : l'utilisateur a besoin de basculer sur son client
 *     mail, le garder ici évite la perte de contexte.
 *   - On ne révèle JAMAIS si l'email existe ou pas (sécurité : pas
 *     d'enum d'utilisateurs). Le message est identique succès/échec
 *     côté UI — sauf erreur réseau/rate-limit clairement technique.
 */
export default function MotDePasseOublie() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = EMAIL_RE.test(email.trim());

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!valid) return;
    setError(null);
    setLoading(true);
    try {
      const redirectTo = `${window.location.origin}/reset-password`;
      const { error: sbError } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        { redirectTo },
      );
      // On affiche "envoyé" même si l'email n'existe pas — pas d'enum
      // d'utilisateurs (anti user enumeration attack). Seule exception
      // = rate-limit, qui mérite un message explicite pour éviter que
      // l'utilisateur clique 10× en pensant que rien ne marche.
      if (sbError) {
        const msg = translateAuthError(sbError);
        if (msg.toLowerCase().includes("trop de tentatives")) {
          setError(msg);
        } else {
          // Erreur silencieuse → on bascule sur l'état succès quand même.
          setSent(true);
        }
      } else {
        setSent(true);
      }
    } catch (err) {
      setError(translateAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-[#0E3B2E] flex flex-col">
      <AppHeader showBack title="Mot de passe oublié" />
      <main className="max-w-md mx-auto px-4 py-6 w-full flex-1">
        {sent ? (
          <div className="flex flex-col gap-4 bg-white rounded-3xl p-6 shadow-[0_24px_60px_-30px_rgba(8,42,32,0.45)]">
            <h2 className="text-lg font-bold text-text">Email envoyé</h2>
            <p className="text-sm text-text/75 leading-relaxed">
              Si un compte est associé à <strong>{email.trim()}</strong>, vous
              recevrez d'ici quelques minutes un email avec un lien pour
              réinitialiser votre mot de passe.
            </p>
            <p className="text-xs text-text/55 leading-relaxed">
              Pensez à vérifier vos spams. Le lien expire après 1 heure.
            </p>
            <Link
              to="/connexion"
              className="mt-2 min-h-[44px] h-12 rounded-xl bg-[#0E3B2E] hover:bg-[#082A20] text-white font-semibold flex items-center justify-center active:scale-[0.99] transition-all"
            >
              Retour à la connexion
            </Link>
          </div>
        ) : (
          <form
            onSubmit={onSubmit}
            className="flex flex-col gap-4 bg-white rounded-3xl p-6 shadow-[0_24px_60px_-30px_rgba(8,42,32,0.45)]"
            noValidate
          >
            <p className="text-sm text-text/70 leading-relaxed">
              Entrez l'email de votre compte. Nous vous enverrons un lien pour
              choisir un nouveau mot de passe.
            </p>

            <div className="flex flex-col gap-1">
              <label htmlFor="email" className="text-sm font-medium text-text">
                Email
              </label>
              <input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="min-h-[44px] h-12 px-4 rounded-xl border border-border bg-white text-base text-text focus:outline-none focus:border-primary"
              />
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
              {loading ? "Envoi…" : "Envoyer le lien"}
            </button>

            <Link
              to="/connexion"
              className="min-h-[44px] flex items-center justify-center text-center text-sm text-primary underline underline-offset-4"
            >
              Retour à la connexion
            </Link>
          </form>
        )}
      </main>
    </div>
  );
}
