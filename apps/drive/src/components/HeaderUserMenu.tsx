import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ClipboardList,
  Home,
  LayoutDashboard,
  LogOut,
  Package,
  Settings,
  User,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

const getInitials = (name?: string | null, email?: string | null): string => {
  const source = (name?.trim() || email?.trim() || "").trim();
  if (!source) return "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
};

const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrateur",
  manager: "Manager",
  employee: "Employé",
  customer: "Client",
};

export const HeaderUserMenu = () => {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();

  const { data: role } = useQuery({
    queryKey: ["user-role", user?.id],
    queryFn: () => fetchRole(user!.id),
    enabled: !!user?.id,
    staleTime: 5 * 60_000,
  });

  // Pas loggé : icône user dans cercle blanc bordé doré pour contraste
  // maximum sur le bg sapin du header. Le doré accroche l'œil et signale
  // l'action sociale (login).
  if (!user) {
    return (
      <Link
        to="/connexion"
        aria-label="Se connecter"
        className="w-11 h-11 md:w-10 md:h-10 rounded-full bg-white border-2 border-[#C9A227]/40 hover:border-[#C9A227] flex items-center justify-center text-[#0E3B2E] active:scale-95 transition-all shadow-md"
      >
        <User size={20} strokeWidth={2.2} aria-hidden />
      </Link>
    );
  }

  const initials = getInitials(profile?.full_name, user.email);
  const roleLabel = role ? ROLE_LABEL[role] : null;
  const isAdmin = role === "admin";
  const isStaff = role === "admin" || role === "employee";

  const handleSignOut = async () => {
    await signOut();
    navigate("/", { replace: true });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Mon compte"
          className="relative h-11 w-11 md:h-10 md:w-10 rounded-full bg-gradient-to-br from-[#C9A227] to-[#C4992C] text-[#0E3B2E] text-sm font-bold flex items-center justify-center shadow-md ring-2 ring-white active:scale-95 transition-all hover:shadow-lg"
        >
          {initials}
          {/* Pastille verte si staff (admin/employee) — signal visuel */}
          {isStaff && (
            <span
              aria-hidden
              className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-[#0E3B2E] ring-2 ring-white"
            />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="min-w-[260px] bg-white border border-border shadow-xl rounded-2xl p-1.5"
      >
        {/* Header user info */}
        <div className="px-3 py-2.5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#C9A227] to-[#C4992C] text-[#0E3B2E] text-sm font-bold flex items-center justify-center shrink-0">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-text truncate">
              {profile?.full_name || "Bienvenue"}
            </p>
            <p className="text-xs text-muted truncate">{user.email}</p>
            {roleLabel && (
              <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full bg-[#0E3B2E]/8 text-[#0E3B2E] text-[10px] font-bold uppercase tracking-wider">
                {roleLabel}
              </span>
            )}
          </div>
        </div>

        <DropdownMenuSeparator className="bg-border my-1" />

        {/* Accueil — accès rapide depuis n'importe quelle page */}
        <DropdownMenuItem
          onClick={() => navigate("/")}
          className="cursor-pointer rounded-xl px-3 py-2 text-sm font-medium hover:bg-[#FAF7EE] focus:bg-[#FAF7EE] gap-2.5"
        >
          <Home className="h-4 w-4 text-muted" aria-hidden />
          Accueil
        </DropdownMenuItem>

        {/* Section client (toujours visible) */}
        <DropdownMenuItem
          onClick={() => navigate("/compte")}
          className="cursor-pointer rounded-xl px-3 py-2 text-sm font-medium hover:bg-[#FAF7EE] focus:bg-[#FAF7EE] gap-2.5"
        >
          <User className="h-4 w-4 text-muted" aria-hidden />
          Mon compte
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => navigate("/commandes")}
          className="cursor-pointer rounded-xl px-3 py-2 text-sm font-medium hover:bg-[#FAF7EE] focus:bg-[#FAF7EE] gap-2.5"
        >
          <Package className="h-4 w-4 text-muted" aria-hidden />
          Mes commandes
        </DropdownMenuItem>

        {/* Section staff — visible si admin OU employee */}
        {isStaff && (
          <>
            <DropdownMenuSeparator className="bg-border my-1" />
            <DropdownMenuLabel className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted">
              Espace pro
            </DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => navigate("/employe")}
              className="cursor-pointer rounded-xl px-3 py-2 text-sm font-medium hover:bg-[#FAF7EE] focus:bg-[#FAF7EE] gap-2.5"
            >
              <ClipboardList className="h-4 w-4 text-[#0E3B2E]" aria-hidden />
              Préparation commandes
            </DropdownMenuItem>
            {isAdmin && (
              <>
                <DropdownMenuItem
                  onClick={() => navigate("/admin")}
                  className="cursor-pointer rounded-xl px-3 py-2 text-sm font-medium hover:bg-[#FAF7EE] focus:bg-[#FAF7EE] gap-2.5"
                >
                  <LayoutDashboard
                    className="h-4 w-4 text-[#0E3B2E]"
                    aria-hidden
                  />
                  Tableau de bord
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => navigate("/admin/reglages")}
                  className="cursor-pointer rounded-xl px-3 py-2 text-sm font-medium hover:bg-[#FAF7EE] focus:bg-[#FAF7EE] gap-2.5"
                >
                  <Settings className="h-4 w-4 text-[#0E3B2E]" aria-hidden />
                  Réglages admin
                </DropdownMenuItem>
              </>
            )}
          </>
        )}

        <DropdownMenuSeparator className="bg-border my-1" />
        <DropdownMenuItem
          onClick={handleSignOut}
          className="cursor-pointer rounded-xl px-3 py-2 text-sm font-medium text-destructive focus:text-destructive hover:bg-red-50 focus:bg-red-50 gap-2.5"
        >
          <LogOut className="h-4 w-4" aria-hidden />
          Se déconnecter
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default HeaderUserMenu;
