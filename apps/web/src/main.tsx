import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./styles.css";
import { I18nProvider } from "./i18n";
import { ToastProvider } from "./components/ui";
import { Shell } from "./components/Shell";
import { getToken } from "./api";
import { Landing } from "./pages/Landing";
import { Auth } from "./pages/Auth";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Inbox = lazy(() => import("./pages/Inbox"));
const Pipeline = lazy(() => import("./pages/Pipeline"));
const Followups = lazy(() => import("./pages/Followups"));
const Bookings = lazy(() => import("./pages/Bookings"));
const Integrations = lazy(() => import("./pages/Integrations"));
const Billing = lazy(() => import("./pages/Billing"));
const Settings = lazy(() => import("./pages/Settings"));

function RequireAuth({ children }: { children: JSX.Element }) {
  return getToken() ? children : <Navigate to="/login" replace />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider>
      <ToastProvider>
        <BrowserRouter>
          <Suspense fallback={<div className="page muted">…</div>}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Auth mode="login" />} />
              <Route path="/signup" element={<Auth mode="signup" />} />
              <Route
                path="/app"
                element={
                  <RequireAuth>
                    <Shell />
                  </RequireAuth>
                }
              >
                <Route index element={<Dashboard />} />
                <Route path="inbox" element={<Inbox />} />
                <Route path="inbox/:leadId" element={<Inbox />} />
                <Route path="pipeline" element={<Pipeline />} />
                <Route path="followups" element={<Followups />} />
                <Route path="bookings" element={<Bookings />} />
                <Route path="integrations" element={<Integrations />} />
                <Route path="billing" element={<Billing />} />
                <Route path="settings" element={<Settings />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </ToastProvider>
    </I18nProvider>
  </StrictMode>,
);
