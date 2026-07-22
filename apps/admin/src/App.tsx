import { Navigate, Route, Routes } from "react-router-dom";
import { useAdminAuth } from "./lib/auth";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";

function Protected({ children }: { children: React.ReactNode }) {
  const { admin, loading } = useAdminAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-accent-500">
        جارٍ التحميل…
      </div>
    );
  }
  return admin ? <>{children}</> : <Navigate to="/login" replace />;
}

export function App() {
  const { admin, loading } = useAdminAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={
          loading ? null : admin ? <Navigate to="/" replace /> : <LoginPage />
        }
      />
      <Route
        path="/"
        element={
          <Protected>
            <DashboardPage />
          </Protected>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
