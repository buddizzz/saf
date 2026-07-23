import { Navigate, Route, Routes } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "./lib/auth";
import { LandingPage } from "./pages/LandingPage";
import { RegisterPage } from "./pages/RegisterPage";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { QueuePage } from "./pages/QueuePage";
import { StaffPage } from "./pages/StaffPage";
import { PrivacyPage } from "./pages/PrivacyPage";
import { BookingPage } from "./pages/BookingPage";
import { UnsubscribePage } from "./pages/UnsubscribePage";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { owner, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 text-brand-600">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-300 border-t-brand-600" />
        {t("common.loading")}
      </div>
    );
  }
  return owner ? <>{children}</> : <Navigate to="/login" replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route path="/q/:slug" element={<QueuePage />} />
      <Route path="/book/:slug" element={<BookingPage />} />
      <Route path="/staff/:slug" element={<StaffPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/unsubscribe/:token" element={<UnsubscribePage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
