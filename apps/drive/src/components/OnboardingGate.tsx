import { useCallback, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { OnboardingFlow } from "@/components/OnboardingFlow";

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
  const [completed, setCompleted] = useState<boolean>(readOnboardingCompleted);

  const handleDismiss = useCallback(() => {
    try {
      localStorage.setItem("onboarding_completed", "true");
    } catch {
      // ignore
    }
    setCompleted(true);
  }, []);

  if (completed || user) return null;
  return <OnboardingFlow onDismiss={handleDismiss} />;
};

export default OnboardingGate;
