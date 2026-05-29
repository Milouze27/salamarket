import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ClipboardList, LayoutDashboard } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import type { Role } from "@/types/role";

const fetchRole = async (userId: string): Promise<Role | null> => {
  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data as { role?: Role } | null)?.role ?? null;
};

// Banner d'accès rapide à l'espace pro pour les comptes staff (admin /
// employee). Rendu DANS le hero du Header (pas après) pour partager le
// bg crème — pas de gap blanc visible. Pas de wrapper section, juste un
// margin-top adapté pour s'intégrer naturellement.
export const StaffBanner = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: role } = useQuery({
    queryKey: ["user-role", user?.id],
    queryFn: () => fetchRole(user!.id),
    enabled: !!user?.id,
    staleTime: 5 * 60_000,
  });

  if (!user || (role !== "admin" && role !== "employee")) return null;
  const isAdmin = role === "admin";

  return (
    <div
      aria-label="Espace pro"
      className="mt-4 rounded-2xl bg-gradient-to-br from-[#0E3B2E] to-[#082A20] text-white p-4 shadow-lg shadow-[#0E3B2E]/20 overflow-hidden relative animate-in fade-in slide-in-from-bottom-1 duration-300"
    >
      {/* Halo doré décoratif */}
      <div
        aria-hidden
        className="absolute -top-8 -right-8 w-28 h-28 rounded-full bg-[#C9A227]/10"
      />
      <div className="relative flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-[#C9A227]">
            Espace pro
          </p>
          <p className="text-base font-bold mt-0.5">
            {isAdmin ? "Bonjour patron" : "Prêt à préparer les commandes ?"}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => navigate("/employe")}
            className="group inline-flex items-center gap-1.5 h-10 px-3.5 rounded-full bg-[#C9A227] text-[#0E3B2E] text-sm font-bold shadow-md active:scale-95 transition-all"
            aria-label="Aller à la préparation des commandes"
          >
            <ClipboardList size={16} strokeWidth={2.5} aria-hidden />
            <span>Préparation</span>
            <ArrowRight
              size={14}
              className="transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => navigate("/admin")}
              className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-white/10 hover:bg-white/15 text-white active:scale-95 transition-all"
              aria-label="Tableau de bord admin"
            >
              <LayoutDashboard size={18} aria-hidden />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default StaffBanner;
