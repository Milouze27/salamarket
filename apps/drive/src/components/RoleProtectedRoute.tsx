import { ReactNode, useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { buildLoginUrl } from "@/lib/redirect";
import type { Role } from "@/types/role";

interface Props {
  children: ReactNode;
  requiredRole?: Role;
  requiredRoles?: Role[];
}

const fetchRole = async (userId: string): Promise<Role | null> => {
  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  const role = (data as { role?: Role } | null)?.role ?? null;
  return role;
};

const FullScreenLoader = () => (
  <div className="min-h-dvh flex flex-col items-center justify-center gap-3 bg-bg">
    <div
      aria-hidden
      className="w-10 h-10 rounded-full border-2 border-border border-t-primary animate-spin"
    />
    <p className="text-sm text-muted">Chargement…</p>
  </div>
);

export const RoleProtectedRoute = ({
  children,
  requiredRole,
  requiredRoles,
}: Props) => {
  const { user, loading: authLoading } = useAuth();
  const location = useLocation();

  const {
    data: role,
    isLoading: roleLoading,
    isError,
  } = useQuery({
    queryKey: ["user-role", user?.id],
    queryFn: () => fetchRole(user!.id),
    enabled: !!user?.id,
    staleTime: 5 * 60_000,
  });

  const allowed: Role[] = requiredRoles
    ? requiredRoles
    : requiredRole
      ? [requiredRole]
      : [];

  const hasAccess = role !== null && role !== undefined && allowed.includes(role);

  useEffect(() => {
    if (authLoading || (user && roleLoading)) return;
    if (!user) return;
    if (isError || !hasAccess) {
      toast.error("Accès non autorisé");
    }
  }, [authLoading, roleLoading, user, isError, hasAccess]);

  if (authLoading || (user && roleLoading)) {
    return <FullScreenLoader />;
  }

  if (!user) {
    return (
      <Navigate
        to={buildLoginUrl(location.pathname + location.search)}
        replace
      />
    );
  }

  if (isError || !hasAccess) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export default RoleProtectedRoute;
