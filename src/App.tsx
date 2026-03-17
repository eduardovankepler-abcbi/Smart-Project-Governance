import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { DataProvider } from "@/contexts/DataContext";
import AppLayout from "@/components/AppLayout";
import ProtectedRoute from "@/components/ProtectedRoute";
import DashboardPage from "@/pages/DashboardPage";
import ProjetosPage from "@/pages/ProjetosPage";
import TarefasPage from "@/pages/TarefasPage";
import AlocacoesPage from "@/pages/AlocacoesPage";
import CapacidadePage from "@/pages/CapacidadePage";
import GanttPage from "@/pages/GanttPage";
import RecursosPage from "@/pages/RecursosPage";
import CadastroPage from "@/pages/CadastroPage";
import GovernancaPage from "@/pages/GovernancaPage";
import HistoricoPage from "@/pages/HistoricoPage";
import LoginPage from "@/pages/LoginPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <BrowserRouter>
        <AuthProvider>
          <DataProvider>
            <Toaster />
            <Sonner />
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route element={<ProtectedRoute />}>
                <Route element={<AppLayout />}>
                  <Route path="/" element={<DashboardPage />} />
                  <Route path="/cadastro" element={<ProtectedRoute allowRoles={["admin", "pmo"]}><CadastroPage /></ProtectedRoute>} />
                  <Route path="/governanca" element={<ProtectedRoute allowRoles={["admin", "pmo"]}><GovernancaPage /></ProtectedRoute>} />
                  <Route path="/projetos" element={<ProjetosPage />} />
                  <Route path="/tarefas" element={<TarefasPage />} />
                  <Route path="/alocacoes" element={<AlocacoesPage />} />
                  <Route path="/capacidade" element={<ProtectedRoute allowRoles={["admin", "pmo", "bi"]}><CapacidadePage /></ProtectedRoute>} />
                  <Route path="/historico" element={<HistoricoPage />} />
                  <Route path="/gantt" element={<GanttPage />} />
                  <Route path="/recursos" element={<RecursosPage />} />
                </Route>
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </DataProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
