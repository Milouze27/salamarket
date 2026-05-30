import { FormEvent, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";
import { useAuth } from "@/hooks/useAuth";
import { translateAuthError } from "@/lib/authErrors";
import { getRedirectFromSearch } from "@/lib/redirect";

export default function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = getRedirectFromSearch(location.search);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signIn({ email: email.trim(), password });
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(translateAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-bg">
      <AppHeader showBack title="Connexion" />
      <main className="max-w-md mx-auto px-4 py-6">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
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

          <div className="flex flex-col gap-1">
            <label htmlFor="password" className="text-sm font-medium text-text">
              Mot de passe
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
            disabled={loading || !email || !password}
            className="min-h-[44px] h-12 rounded-xl bg-[#0E3B2E] hover:bg-[#082A20] text-white font-semibold disabled:opacity-50 active:scale-[0.99] transition-all"
          >
            {loading ? "Connexion…" : "Se connecter"}
          </button>

          <Link
            to={`/inscription${location.search}`}
            className="min-h-[44px] flex items-center justify-center text-center text-sm text-primary underline underline-offset-4"
          >
            Pas de compte ? Créer un compte
          </Link>
        </form>
      </main>
    </div>
  );
}
