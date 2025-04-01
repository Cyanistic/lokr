import { Navigate, Outlet } from "react-router-dom";
import { isAuthenticated } from "../utils";

export function ProtectedRoute() {
  const isAuth = isAuthenticated();
  return isAuth ? (
    <Outlet />
  ) : (
    <Navigate to={`/login?redirect=${window.location.pathname}`} replace />
  );
}
