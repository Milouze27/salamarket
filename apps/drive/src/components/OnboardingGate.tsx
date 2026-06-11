import { useCallback, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { OnboardingFlow } from "@/components/OnboardingFlow";

// Pages où l'onboarding doit être skip — soit pages de deep-link
// acquisition (fiche produit /produit/:id, trace lot /lot/:id atteints
// via QR / pub / partage), soit pages auth où il bloque l'accès aux
// flows de connexion / création de compte / reset password. Si on ne
// skip pas ces pages, un nouvel utilisateur tombant dessus via deep
// link voit l'overlay d'onboarding plein écran au lieu du contenu
// attendu — et « Commencer mes courses » le redirige vers la home, lui
// faisant perdre le contexte produit/lot : parcours acquisition cassé.
const PUBLIC_PATHS_SKIP_ONBOARDING = [
  "/produit/",
  "/lot/",
  // Deep-links parcours d'achat (lien partagé / marque-page) : l'overlay
  // d'onboarding masquait le panier / les créneaux derrière un spinner
  // (B1-13). On les skip comme les fiches produit.
  "/panier",
  "/creneaux",
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
