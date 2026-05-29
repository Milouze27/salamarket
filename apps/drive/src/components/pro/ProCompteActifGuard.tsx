// Garde additionnelle aux pages Pro réservées aux comptes actifs.
// À mettre EN INTÉRIEUR d'une <ProtectedRoute> (qui assure user!=null).
//
// Comportement :
// - user présent mais aucun compte_pro                  → /pro/inscription
// - compte_pro.statut !== "actif"                       → /pro/login (notice)
// - compte_pro.statut === "actif"                       → children

import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useComptePro } from "@/hooks/useComptePro";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  children: ReactNode;
}

const FullScreenLoader = () => (
  <div className="min-h-dvh flex items-center justify-center bg-slate-50">
    <Loader2 className="w-8 h-8 text-slate-400 animate-spin" aria-label="Chargement" />
  </div>
);

export const ProCompteActifGuard = ({ children }: Props) => {
  const { user, loading: authLoading } = useAuth();
  const { compte, isLoading } = useComptePro();

  if (authLoading || isLoading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/pro/login" replace />;
  if (!compte) return <Navigate to="/pro/inscription" replace />;
  if (compte.statut !== "actif") return <Navigate to="/pro/login" replace />;

  return <>{children}</>;
};
