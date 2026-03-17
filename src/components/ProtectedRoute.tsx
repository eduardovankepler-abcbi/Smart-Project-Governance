import type { ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import type { UserRole } from "@/types/auth";

interface ProtectedRouteProps {
  allowRoles?: UserRole[];
  children?: ReactNode;
}

export default function ProtectedRoute({ allowRoles, children }: ProtectedRouteProps) {
  const { user, loading, isAuthenticated } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Carregando sessão...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (allowRoles?.length && user && !allowRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}
