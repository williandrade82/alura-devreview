import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
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

function App() {
  return (
    <BrowserRouter>
      <AppLayout>
        <Suspense fallback={<p className="p-6 text-sm text-gray-400">Carregando...</p>}>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/regras" element={<RulesPage />} />
            <Route path="/historico" element={<HistoryPage />} />
            <Route path="/adrs" element={<AdrsPage />} />
          </Routes>
        </Suspense>
      </AppLayout>
    </BrowserRouter>
  );
}

export default App;
