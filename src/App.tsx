import { BrowserRouter, Route, Routes } from "react-router-dom";
import { DefaultProviders } from "./components/providers/default.tsx";
import { useServiceWorker } from "@/hooks/use-service-worker.ts";
import { useAppAppearance } from "@/hooks/use-app-appearance.ts";
import AuthCallback from "./pages/auth/Callback.tsx";
import AppLayout from "./pages/_layout/AppLayout.tsx";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import DriversPage from "./pages/drivers/page.tsx";
import DriverRegistrationForm from "./pages/drivers/_components/DriverRegistrationForm.tsx";
import DriverProfilePage from "./pages/drivers/[driverId]/page.tsx";
import CreditsPage from "./pages/credits/page.tsx";
import IssueCreditPage from "./pages/credits/_components/IssueCreditPage.tsx";
import TransactionDetailPage from "./pages/credits/[transactionId]/page.tsx";
import ReportsPage from "./pages/reports/page.tsx";
import ReconciliationPage from "./pages/reconciliation/page.tsx";
import CollectionHandoverPage from "./pages/handovers/page.tsx";
import SettingsPage from "./pages/settings/page.tsx";
import RiskManagerPage from "./pages/risk/page.tsx";
import MessagesPage from "./pages/messages/page.tsx";
import EodPage from "./pages/eod/page.tsx";
import PwaInstallBanner from "./components/PwaInstallBanner.tsx";

export default function App() {
  useServiceWorker();
  useAppAppearance(); // Apply stored theme/colour settings on mount
  return (
    <DefaultProviders>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Routes>
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route element={<AppLayout />}>
            <Route path="/" element={<Index />} />
            <Route path="/drivers" element={<DriversPage />} />
            <Route path="/drivers/new" element={<DriverRegistrationForm />} />
            <Route path="/drivers/:driverId" element={<DriverProfilePage />} />
            <Route path="/credits" element={<CreditsPage />} />
            <Route path="/credits/new" element={<IssueCreditPage />} />
            <Route path="/credits/:transactionId" element={<TransactionDetailPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/reconciliation" element={<ReconciliationPage />} />
            <Route path="/handovers" element={<CollectionHandoverPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/risk" element={<RiskManagerPage />} />
            <Route path="/messages" element={<MessagesPage />} />
            <Route path="/eod" element={<EodPage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
      <PwaInstallBanner />
    </DefaultProviders>
  );
}
