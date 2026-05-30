import { FormEvent, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";
import { useAuth } from "@/hooks/useAuth";
import { translateAuthError } from "@/lib/authErrors";
import { getRedirectFromSearch } from "@/lib/redirect";

const PHONE_RE = /^(\+33|0)[1-9](\d{8})$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Signup() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = getRedirectFromSearch(location.search);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (fullName.trim().length < 2) e.fullName = "Min. 2 caractères";
    if (!PHONE_RE.test(phone.replace(/\s/g, "")))
      e.phone = "Numéro invalide (ex : 0612345678)";
    if (!EMAIL_RE.test(email.trim())) e.email = "Email invalide";
    if (password.length < 8) e.password = "Min. 8 caractères";
    if (confirm !== password) e.confirm = "Les mots de passe ne correspondent pas";
    return e;
  }, [fullName, phone, email, password, confirm]);

  const valid = Object.keys(errors).length === 0;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched({ fullName: true, phone: true, email: true, password: true, confirm: true });
    if (!valid) return;
    setServerError(null);
    setLoading(true);
    try {
      await signUp({
        email: email.trim(),
        password,
        full_name: fullName.trim(),
        phone: phone.replace(/\s/g, ""),
      });
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setServerError(translateAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const fieldClass = (key: string) =>
    `min-h-[44px] h-12 px-4 rounded-xl border bg-white text-base text-text focus:outline-none ${
      touched[key] && errors[key]
        ? "border-red-400 focus:border-red-500"
        : "border-border focus:border-primary"
    }`;

  const fieldError = (key: string) =>
    touched[key] && errors[key] ? (
      <p className="text-xs text-red-600 mt-1">{errors[key]}</p>
    ) : null;

  return (
    <div className="min-h-dvh bg-bg">
      <AppHeader showBack title="Créer un compte" />
      <main className="max-w-md mx-auto px-4 py-6">
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col">
            <label htmlFor="fullName" className="text-sm font-medium text-text mb-1">
              Nom complet
            </label>
            <input
              id="fullName"
              type="text"
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, fullName: true }))}
              className={fieldClass("fullName")}
            />
            {fieldError("fullName")}
          </div>

          <div className="flex flex-col">
            <label htmlFor="phone" className="text-sm font-medium text-text mb-1">
              Téléphone
            </label>
            <input
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="0612345678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
              className={fieldClass("phone")}
            />
            {fieldError("phone")}
          </div>

          <div className="flex flex-col">
            <label htmlFor="email" className="text-sm font-medium text-text mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, email: true }))}
              className={fieldClass("email")}
            />
            {fieldError("email")}
          </div>

          <div className="flex flex-col">
            <label htmlFor="password" className="text-sm font-medium text-text mb-1">
              Mot de passe
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, password: true }))}
              className={fieldClass("password")}
            />
            {fieldError("password")}
          </div>

          <div className="flex flex-col">
            <label htmlFor="confirm" className="text-sm font-medium text-text mb-1">
              Confirmation du mot de passe
            </label>
            <input
              id="confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, confirm: true }))}
              className={fieldClass("confirm")}
            />
            {fieldError("confirm")}
          </div>

          {serverError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {serverError}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !valid}
            className="min-h-[44px] h-12 rounded-xl bg-[#0E3B2E] hover:bg-[#082A20] text-white font-semibold disabled:opacity-50 active:scale-[0.99] transition-all"
          >
            {loading ? "Création…" : "Créer mon compte"}
          </button>

          <p className="text-xs text-muted text-center px-2">
            En créant votre compte, vous acceptez d'être contacté pour le suivi de vos
            commandes au retrait.
          </p>
        </form>
      </main>
    </div>
  );
}
