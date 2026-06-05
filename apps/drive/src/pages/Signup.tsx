import { FormEvent, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { translateAuthError } from "@/lib/authErrors";
import { getRedirectFromSearch } from "@/lib/redirect";

/**
 * RGPD art. 7.1 — preuve du recueil du consentement. On journalise, au moment
 * de l'inscription, l'acceptation des CGV + politique de confidentialité (case
 * bloquante) et l'opt-in marketing (facultatif). La table consent_log autorise
 * l'INSERT anon (cf. migration 20260601000010) : pas besoin d'attendre une
 * session. Best-effort strict : un échec de journalisation ne doit JAMAIS
 * empêcher la création du compte (on log en console et on continue).
 */
async function logSignupConsent(
  email: string,
  marketing: boolean,
): Promise<void> {
  try {
    await supabase.from("consent_log").insert({
      email,
      consent_cgv: true,
      consent_privacy: true,
      consent_marketing: marketing,
      user_agent:
        typeof navigator !== "undefined"
          ? navigator.userAgent.slice(0, 500)
          : null,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[consent_log] enregistrement du consentement échoué:", err);
  }
}

// BUG-013 — Accepter les numéros internationaux (E.164 relax) en plus du
// format français historique. Règle :
//   - format FR legacy : 0[1-9]XXXXXXXX (10 chiffres, 06/07 par défaut)
//   - format international : +<country><7..14 digits>, premier digit pays non nul
// On normalise les espaces avant test (déjà fait côté caller).
const PHONE_FR_RE = /^(\+33|0)[1-9]\d{8}$/;
const PHONE_E164_RE = /^\+[1-9]\d{6,14}$/;
const PHONE_RE = {
  test: (v: string) => PHONE_FR_RE.test(v) || PHONE_E164_RE.test(v),
};
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
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptMarketing, setAcceptMarketing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // a11y : refs sur chaque champ pour redonner le focus au 1er champ en
  // erreur après une soumission. L'ordre du tableau suit l'ordre visuel du
  // formulaire (top → bottom), ce qui détermine quel champ reçoit le focus.
  const fieldRefs: Record<string, React.RefObject<HTMLInputElement>> = {
    fullName: useRef<HTMLInputElement>(null),
    phone: useRef<HTMLInputElement>(null),
    email: useRef<HTMLInputElement>(null),
    password: useRef<HTMLInputElement>(null),
    confirm: useRef<HTMLInputElement>(null),
  };
  const FIELD_ORDER = ["fullName", "phone", "email", "password", "confirm"];
  const serverErrorRef = useRef<HTMLDivElement>(null);

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (fullName.trim().length < 2) e.fullName = "Min. 2 caractères";
    if (!PHONE_RE.test(phone.replace(/[\s.-]/g, "")))
      e.phone = "Numéro invalide (ex : 0612345678 ou +212612345678)";
    if (!EMAIL_RE.test(email.trim())) e.email = "Email invalide";
    if (password.length < 8) e.password = "Min. 8 caractères";
    if (confirm !== password)
      e.confirm = "Les mots de passe ne correspondent pas";
    return e;
  }, [fullName, phone, email, password, confirm]);

  const valid = Object.keys(errors).length === 0 && acceptedTerms;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    // Guard anti double-submit (BUG-001) : si une requête est déjà en
    // vol on ignore les clics suivants, sinon 10 clics rapides créent 9
    // erreurs 500 + un compte fantôme à moitié provisionné.
    if (loading) return;
    setTouched({
      fullName: true,
      phone: true,
      email: true,
      password: true,
      confirm: true,
    });
    if (!valid) {
      // a11y : focus le 1er champ en erreur (ordre visuel) pour guider la
      // correction au clavier / lecteur d'écran.
      const firstInvalid = FIELD_ORDER.find((k) => errors[k]);
      if (firstInvalid) fieldRefs[firstInvalid].current?.focus();
      return;
    }
    setServerError(null);
    setLoading(true);
    try {
      const cleanedEmail = email.trim();
      await signUp({
        email: cleanedEmail,
        password,
        full_name: fullName.trim(),
        phone: phone.replace(/[\s.-]/g, ""),
      });
      // Preuve RGPD art. 7 — best-effort, ne bloque jamais l'inscription.
      await logSignupConsent(cleanedEmail, acceptMarketing);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setServerError(translateAuthError(err));
      // a11y : l'erreur serveur n'est rattachée à aucun champ → on focus la
      // bannière (tabIndex={-1}) pour la porter au lecteur d'écran.
      serverErrorRef.current?.focus();
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

  const hasError = (key: string) => Boolean(touched[key] && errors[key]);

  const fieldError = (key: string) =>
    hasError(key) ? (
      <p id={`${key}-error`} className="text-xs text-red-600 mt-1">
        {errors[key]}
      </p>
    ) : null;

  // a11y : props communes reliant chaque input à son span d'erreur quand il
  // est en faute (aria-describedby + aria-invalid).
  const a11yProps = (key: string) => ({
    ref: fieldRefs[key],
    "aria-invalid": hasError(key) ? true : undefined,
    "aria-describedby": hasError(key) ? `${key}-error` : undefined,
  });

  return (
    // BUG-017 — alignement Signup/Login : bg sapin pleine page, card
    // blanche pour le formulaire. Cohérence avec /v2/login Stock.
    <div className="min-h-dvh bg-sapin flex flex-col">
      <AppHeader showBack title="Créer un compte" />
      <main className="max-w-md mx-auto px-4 py-6 w-full flex-1">
        <form
          onSubmit={onSubmit}
          className="flex flex-col gap-4 bg-white rounded-3xl p-6 shadow-[0_24px_60px_-30px_rgba(8,42,32,0.45)]"
          noValidate
        >
          <div className="flex flex-col">
            <label
              htmlFor="fullName"
              className="text-sm font-medium text-text mb-1"
            >
              Nom complet
            </label>
            <input
              id="fullName"
              type="text"
              autoComplete="name"
              {...a11yProps("fullName")}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, fullName: true }))}
              className={fieldClass("fullName")}
            />
            {fieldError("fullName")}
          </div>

          <div className="flex flex-col">
            <label
              htmlFor="phone"
              className="text-sm font-medium text-text mb-1"
            >
              Téléphone
            </label>
            <input
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="0612345678 ou +212612345678"
              {...a11yProps("phone")}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
              className={fieldClass("phone")}
            />
            {fieldError("phone")}
          </div>

          <div className="flex flex-col">
            <label
              htmlFor="email"
              className="text-sm font-medium text-text mb-1"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              {...a11yProps("email")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, email: true }))}
              className={fieldClass("email")}
            />
            {fieldError("email")}
          </div>

          <div className="flex flex-col">
            <label
              htmlFor="password"
              className="text-sm font-medium text-text mb-1"
            >
              Mot de passe
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              {...a11yProps("password")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, password: true }))}
              className={fieldClass("password")}
            />
            {fieldError("password")}
          </div>

          <div className="flex flex-col">
            <label
              htmlFor="confirm"
              className="text-sm font-medium text-text mb-1"
            >
              Confirmation du mot de passe
            </label>
            <input
              id="confirm"
              type="password"
              autoComplete="new-password"
              {...a11yProps("confirm")}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, confirm: true }))}
              className={fieldClass("confirm")}
            />
            {fieldError("confirm")}
          </div>

          <div
            ref={serverErrorRef}
            role="alert"
            aria-live="polite"
            tabIndex={-1}
            className="focus:outline-none"
          >
            {serverError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {serverError}
              </p>
            )}
          </div>

          {/* CGV + Politique de confidentialité — checkbox bloquante.
              Obligation légale (LCEN + RGPD : consentement éclairé). */}
          <label
            htmlFor="acceptTerms"
            className="flex items-start gap-3 text-sm text-text cursor-pointer select-none mt-1"
          >
            <input
              id="acceptTerms"
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 rounded border-2 border-sapin/40 accent-sapin cursor-pointer focus:outline-none focus:ring-2 focus:ring-sapin/30"
            />
            <span className="leading-snug text-[13px] text-ink/75">
              J'accepte les{" "}
              <Link
                to="/cgv"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 text-sapin font-medium hover:text-sapin-deep"
              >
                Conditions générales de vente
              </Link>{" "}
              et la{" "}
              <Link
                to="/confidentialite"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 text-sapin font-medium hover:text-sapin-deep"
              >
                Politique de confidentialité
              </Link>
              .
            </span>
          </label>

          {/* Opt-in marketing — facultatif, NON coché par défaut (RGPD :
              consentement libre et spécifique, distinct de l'acceptation des
              CGV). Journalisé séparément dans consent_log.consent_marketing. */}
          <label
            htmlFor="acceptMarketing"
            className="flex items-start gap-3 text-sm text-text cursor-pointer select-none"
          >
            <input
              id="acceptMarketing"
              type="checkbox"
              checked={acceptMarketing}
              onChange={(e) => setAcceptMarketing(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 rounded border-2 border-sapin/40 accent-sapin cursor-pointer focus:outline-none focus:ring-2 focus:ring-sapin/30"
            />
            <span className="leading-snug text-[13px] text-ink/75">
              J'accepte de recevoir les offres et nouveautés Salamarket par
              email (facultatif, résiliable à tout moment).
            </span>
          </label>

          <button
            type="submit"
            disabled={loading || !valid}
            className="min-h-[44px] h-12 rounded-xl bg-sapin hover:bg-sapin-deep text-white font-semibold disabled:opacity-50 active:scale-[0.99] transition-all"
          >
            {loading ? "Création…" : "Créer mon compte"}
          </button>

          <p className="text-xs text-muted text-center px-2">
            En créant votre compte, vous acceptez d'être contacté pour le suivi
            de vos commandes au retrait.
          </p>
        </form>
      </main>
    </div>
  );
}
