import { useCallback, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { OnboardingFlow } from "@/components/OnboardingFlow";

// Pages où l'onboarding doit être skip — soit pages publiques où il
// gêne (trace lot), soit pages auth où il bloque l'accès aux flows de
// connexion / création de compte / reset password. Si on ne skip pas
// ces pages, un nouvel utilisateur tombant sur /connexion via deep
// link voit l'overlay d'onboarding au lieu du formulaire — broken UX.
const PUBLIC_PATHS_SKIP_ONBOARDING = [
  "/lot/",
  "/connexion",
  "/inscription",
  "/pro/login",
  "/pro/inscription",
  "/mot-de-passe-oublie",
  "/reset-password",
];

// Lecture synchrone du flag "déjà onboardé". Si on lit localStorage dans
// un useEffect, le 1er render renvoie null et la homepage s'affiche
// brièvement (état loading blanc) AVANT que l'onboarding overlay apparaisse
// au 2e render. En lisant via le lazy initializer de useState, l'onboarding
// est rendu dès le 1er paint pour les nouveaux installateurs.
const readOnboardingCompleted = (): boolean => {
  try {
    return localStorage.getItem("onboarding_completed") === "true";
  } catch {
    return true;
  }
};

export const OnboardingGate = () => {
  const { user } = useAuth();
  const location = useLocation();
  const [completed, setCompleted] = useState<boolean>(readOnboardingCompleted);

  const handleDismiss = useCallback(() => {
    try {
      localStorage.setItem("onboarding_completed", "true");
    } catch {
      // ignore
    }
    setCompleted(true);
  }, []);

  const isPublicTracePage = PUBLIC_PATHS_SKIP_ONBOARDING.some((p) =>
    location.pathname.startsWith(p),
  );

  if (completed || user || isPublicTracePage) return null;
  return <OnboardingFlow onDismiss={handleDismiss} />;
};

export default OnboardingGate;
