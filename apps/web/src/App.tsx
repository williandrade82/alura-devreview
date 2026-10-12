import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { AuthGate } from "@/components/layout/AuthGate";
import { DashboardPage } from "@/pages/DashboardPage";

// Rotas secundárias carregadas sob demanda.
const RulesPage = lazy(() =>
  import("@/pages/RulesPage").then((m) => ({ default: m.RulesPage }))
);
const HistoryPage = lazy(() =>
  import("@/pages/HistoryPage").then((m) => ({ default: m.HistoryPage }))
);
const AdrsPage = lazy(() =>
  import("@/pages/AdrsPage").then((m) => ({ default: m.AdrsPage }))
);

const MembersPage = lazy(() =>
  import("@/pages/MembersPage").then((m) => ({ default: m.MembersPage }))
);

function App() {
  return (
    <BrowserRouter>
      <AuthGate>
      <AppLayout>
        <Suspense fallback={<p className="p-6 text-sm text-gray-400">Carregando...</p>}>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/regras" element={<RulesPage />} />
            <Route path="/historico" element={<HistoryPage />} />
            <Route path="/adrs" element={<AdrsPage />} />
            <Route path="/membros" element={<MembersPage />} />
          </Routes>
        </Suspense>
      </AppLayout>
      </AuthGate>
    </BrowserRouter>
  );
}

export default App;
