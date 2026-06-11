// Connexion Drive Pro. Réutilise supabase.auth.signInWithPassword.
// Après login :
//  - si compte_pro statut "actif"     → /pro/catalogue
//  - si compte_pro statut "en_validation" → message d'attente, signOut
//  - si compte_pro statut "suspendu"  → message + signOut
//  - sinon (pas de compte_pro)        → redirection inscription

import { FormEvent, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { supabase } from "@/integrations/supabase/client";
import { translateAuthError } from "@/lib/authErrors";
import { useAuth } from "@/hooks/useAuth";
import { useComptePro } from "@/hooks/useComptePro";

type StateNotice =
  | { kind: "en_validation" }
  | { kind: "suspendu" }
  | { kind: "archive" }
  | { kind: "missing" };

const NOTICES: Record<StateNotice["kind"], { title: string; body: string }> = {
  en_validation: {
    title: "Compte en attente de validation",
    body: "Votre demande est en cours d'examen. Nous validons les comptes Pro sous 24-48 h ouvrées et vous tiendrons informés par email.",
  },
  suspendu: {
    title: "Compte suspendu",
    body: "Votre accès Drive Pro est temporairement suspendu. Merci de contacter notre service commercial pour régulariser la situation.",
  },
  archive: {
    title: "Compte archivé",
    body: "Ce compte a été archivé. Contactez le support pour réactivation.",
  },
  missing: {
    title: "Aucun compte Pro associé",
    body: "Cet email n'est lié à aucun compte professionnel. Vous pouvez en créer un en quelques minutes.",
  },
};

export default function ProLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();
  const { compte, isLoading: compteLoading } = useComptePro();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<StateNotice | null>(null);

  // Redirection auto si déjà connecté et compte actif
  useEffect(() => {
    if (authLoading || compteLoading) return;
    if (!user) return;
    if (!compte) {
      // Connecté mais aucun compte Pro : on garde le user signé pour
      // l'inscription mais on affiche un notice (cas particulier qui
      // veut s'inscrire en Pro a posteriori).
      setNotice({ kind: "missing" });
      return;
    }
    if (compte.statut === "actif") {
      // Honore un deep-link Pro (?redirect=/pro/...) après connexion,
      // sinon catalogue par défaut. On reste dans l'espace Pro.
      const params = new URLSearchParams(location.search);
      const redirect = params.get("redirect");
      const dest =
        redirect && redirect.startsWith("/pro/") && !redirect.startsWith("//")
          ? redirect
          : "/pro/catalogue";
      navigate(dest, { replace: true });
      return;
    }
    if (compte.statut === "en_validation") {
      setNotice({ kind: "en_validation" });
      return;
    }
    if (compte.statut === "suspendu") {
      setNotice({ kind: "suspendu" });
      return;
    }
    if (compte.statut === "archive") {
      setNotice({ kind: "archive" });
      return;
    }
  }, [authLoading, compteLoading, user, compte, navigate, location.search]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error: signError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signError) throw signError;
      // Le useEffect prend le relais via useComptePro.
    } catch (err) {
      setError(translateAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setNotice(null);
  };

  const isBusy = authLoading || (user && compteLoading);

  return (
    <div className="min-h-dvh bg-cream flex flex-col">
      <header className="bg-sapin text-white border-b border-gold/30">
        <div className="max-w-md mx-auto px-4 py-4">
          <span className="text-xs uppercase tracking-widest text-gold-bright font-semibold">
            Drive Pro
          </span>
          <h1 className="text-2xl font-bold mt-1">Espace professionnel</h1>
        </div>
      </header>

      <main className="flex-1 max-w-md mx-auto w-full px-4 py-6">
        {isBusy ? (
          <div className="flex items-center justify-center py-12 text-ink-soft">
            <Loader2 className="animate-spin" aria-hidden />
          </div>
        ) : notice ? (
          <div className="space-y-4">
            <Alert>
              <AlertTitle>{NOTICES[notice.kind].title}</AlertTitle>
              <AlertDescription>{NOTICES[notice.kind].body}</AlertDescription>
            </Alert>
            <div className="flex gap-3">
              {notice.kind === "missing" && (
                <Link to="/pro/inscription" className="flex-1">
                  <Button className="w-full bg-gold text-sapin-deep hover:bg-gold-bright">
                    Créer un compte Pro
                  </Button>
                </Link>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={handleSignOut}
                className="flex-1"
              >
                Se déconnecter
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                aria-label="Email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="text-base md:text-base"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                aria-label="Mot de passe"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="text-base md:text-base"
              />
            </div>

            {error && (
              <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={loading || !email || !password}
              className="bg-gold text-sapin-deep hover:bg-gold-bright disabled:opacity-50 h-11 rounded-xl font-bold"
            >
              {loading ? "Connexion…" : "Se connecter"}
            </Button>

            <div className="flex items-center justify-between text-sm pt-2">
              <Link
                to="/pro/inscription"
                state={{ from: location }}
                className="text-ink-soft underline underline-offset-4 hover:text-ink"
              >
                Créer un compte Pro
              </Link>
              <Link
                to="/connexion"
                className="text-ink-soft text-xs hover:text-ink-soft"
              >
                Particulier ?
              </Link>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
