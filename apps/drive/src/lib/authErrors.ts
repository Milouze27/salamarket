// Traduit les erreurs Supabase Auth en messages français
export function translateAuthError(error: unknown): string {
  const msg =
    (error && typeof error === "object" && "message" in error
      ? String((error as { message: unknown }).message)
      : "") || "";
  const code =
    (error && typeof error === "object" && "code" in error
      ? String((error as { code: unknown }).code)
      : "") || "";

  const haystack = `${code} ${msg}`.toLowerCase();

  if (haystack.includes("invalid_credentials") || haystack.includes("invalid login")) {
    return "Email ou mot de passe incorrect";
  }
  if (haystack.includes("email_address_invalid") || haystack.includes("invalid email")) {
    return "Email invalide";
  }
  if (haystack.includes("user_already_exists") || haystack.includes("already registered")) {
    return "Un compte existe déjà avec cet email";
  }
  if (haystack.includes("weak_password") || haystack.includes("password should be")) {
    return "Mot de passe trop faible (min. 8 caractères)";
  }
  if (haystack.includes("email_not_confirmed")) {
    return "Email non confirmé";
  }
  if (haystack.includes("over_email_send_rate_limit") || haystack.includes("rate limit")) {
    return "Trop de tentatives, réessayez dans quelques instants";
  }
  return "Une erreur est survenue, réessayez.";
}
