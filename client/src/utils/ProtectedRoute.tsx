import { Navigate, Outlet } from "react-router-dom";
import { isAuthenticated } from "../utils";

export function ProtectedRoute() {
  const isAuth = isAuthenticated();
  const params = new URLSearchParams({
    redirect: location.pathname + location.search + location.hash,
  });
  return isAuth ? <Outlet /> : <Navigate to={`/login?${params}`} replace />;
}
