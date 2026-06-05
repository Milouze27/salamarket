import { useEffect, useRef } from "react";
import { RefreshCw, X } from "lucide-react";
import { toast } from "sonner";

/**
 * SwUpdatePrompt — pont UI manquant pour la mise à jour du Service Worker
 * (bug-sw-update-prompt-dead).
 *
 * main.tsx dispatch un CustomEvent('sw-update-available') quand un nouveau
 * SW est installé-en-attente derrière le SW actif, et écoute
 * 'sw-activate-update' pour SKIP_WAITING + reload. Mais AUCUN composant ne
 * s'abonnait à 'sw-update-available' : après un deploy, l'utilisateur PWA
 * restait coincé sur l'ancien bundle jusqu'à fermeture totale des onglets
 * (quasi jamais en PWA standalone iOS).
 *
 * Ce composant comble le trou : il affiche un toast sonner persistant
 * sapin/or (même registre que InstallPrompt) "Nouvelle version disponible
 * — Recharger" dont l'action redéclenche 'sw-activate-update'. Le SW se
 * met à jour proprement sans perte d'état.
 *
 * Monté une fois (App.tsx). Ne rend rien lui-même (le toast est porté par
 * le <Toaster> sonner déjà présent dans l'arbre).
 */
export const SwUpdatePrompt = () => {
  // Garde anti-doublon : plusieurs 'updatefound' ne doivent pas empiler
  // des toasts identiques.
  const shownRef = useRef(false);

  useEffect(() => {
    const onUpdateAvailable = () => {
      if (shownRef.current) return;
      shownRef.current = true;

      toast.custom(
        (t) => (
          <div className="flex items-center gap-3 w-full max-w-sm rounded-2xl bg-gradient-to-br from-[#0E3B2E] to-[#082A20] p-4 shadow-xl">
            <div className="w-10 h-10 rounded-full bg-[#C9A227] flex items-center justify-center shrink-0">
              <RefreshCw
                size={18}
                className="text-[#0E3B2E]"
                strokeWidth={2.4}
                aria-hidden
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white leading-tight">
                Nouvelle version disponible
              </p>
              <p className="text-xs text-white/70 mt-0.5 leading-snug">
                Rechargez pour les dernières améliorations.
              </p>
            </div>
            <button
              onClick={() => {
                // main.tsx écoute cet event : SKIP_WAITING au SW en attente
                // puis reload une fois le controllerchange détecté.
                window.dispatchEvent(new CustomEvent("sw-activate-update"));
                toast.dismiss(t);
              }}
              className="shrink-0 h-9 px-3 rounded-full bg-[#C9A227] text-[#0E3B2E] text-xs font-bold active:scale-95 transition-transform"
            >
              Recharger
            </button>
            <button
              onClick={() => {
                // Re-prompt autorisé sur un prochain 'updatefound'.
                shownRef.current = false;
                toast.dismiss(t);
              }}
              aria-label="Fermer"
              className="shrink-0 w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-white/60 active:scale-90 transition-transform"
            >
              <X size={16} aria-hidden />
            </button>
          </div>
        ),
        { duration: Infinity },
      );
    };

    window.addEventListener("sw-update-available", onUpdateAvailable);
    return () =>
      window.removeEventListener("sw-update-available", onUpdateAvailable);
  }, []);

  return null;
};

export default SwUpdatePrompt;
