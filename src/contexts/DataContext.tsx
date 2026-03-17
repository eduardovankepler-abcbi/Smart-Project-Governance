import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import type { Projeto, Tarefa, Recurso, BusinessUnit, Produto } from "@/data/projectData";
import {
  businessUnits as defaultBusinessUnits,
  produtos as defaultProdutos,
  projetos as defaultProjetos,
  tarefas as defaultTarefas,
  recursos as defaultRecursos,
  getStatusColor,
  formatCurrency,
} from "@/data/projectData";
import { isApiEnabled } from "@/config/api";
import * as api from "@/services/api";
import { getTaskResourceNames } from "@/utils/projectModel";
import { useAuth } from "@/contexts/AuthContext";

interface DataContextType {
  businessUnits: (BusinessUnit & { id?: number })[];
  produtos: (Produto & { id?: number })[];
  projetos: Projeto[];
  tarefas: Tarefa[];
  recursos: (Recurso & { id?: number })[];
  setBusinessUnits: (data: (BusinessUnit & { id?: number })[]) => void;
  setProdutos: (data: (Produto & { id?: number })[]) => void;
  setProjetos: (data: Projeto[]) => void;
  setTarefas: (data: Tarefa[]) => void;
  setRecursos: (data: (Recurso & { id?: number })[]) => void;
  getUniqueProjetos: () => string[];
  getUniqueResponsaveis: () => string[];
  refreshAll: () => Promise<void>;
  refreshProjetos: () => Promise<void>;
  refreshProdutos: () => Promise<void>;
  refreshTarefas: () => Promise<void>;
  refreshRecursos: () => Promise<void>;
  refreshBusinessUnits: () => Promise<void>;
  loading: boolean;
}

const DataContext = createContext<DataContextType | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [businessUnits, setBusinessUnits] = useState<(BusinessUnit & { id?: number })[]>(defaultBusinessUnits);
  const [produtos, setProdutos] = useState<(Produto & { id?: number })[]>(defaultProdutos);
  const [projetos, setProjetos] = useState<Projeto[]>(defaultProjetos);
  const [tarefas, setTarefas] = useState<Tarefa[]>(defaultTarefas);
  const [recursos, setRecursos] = useState<(Recurso & { id?: number })[]>(defaultRecursos);
  const [loading, setLoading] = useState(false);

  const refreshBusinessUnits = useCallback(async () => {
    try {
      const data = await api.getBusinessUnits();
      setBusinessUnits(data);
    } catch (e) {
      console.error("Error refreshing business units:", e);
    }
  }, []);

  const refreshProjetos = useCallback(async () => {
    try {
      const data = await api.getProjetos();
      setProjetos(data);
    } catch (e) {
      console.error("Error refreshing projetos:", e);
    }
  }, []);

  const refreshProdutos = useCallback(async () => {
    try {
      const data = await api.getProdutos();
      setProdutos(data);
    } catch (e) {
      console.error("Error refreshing produtos:", e);
    }
  }, []);

  const refreshTarefas = useCallback(async () => {
    try {
      const data = await api.getTarefas();
      setTarefas(data);
    } catch (e) {
      console.error("Error refreshing tarefas:", e);
    }
  }, []);

  const refreshRecursos = useCallback(async () => {
    try {
      const data = await api.getRecursos();
      setRecursos(data);
    } catch (e) {
      console.error("Error refreshing recursos:", e);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([refreshBusinessUnits(), refreshProdutos(), refreshProjetos(), refreshTarefas(), refreshRecursos()]);
    setLoading(false);
  }, [refreshBusinessUnits, refreshProdutos, refreshProjetos, refreshTarefas, refreshRecursos]);

  useEffect(() => {
    if (isApiEnabled() && isAuthenticated && !authLoading) {
      refreshAll();
    }
  }, [refreshAll, isAuthenticated, authLoading]);

  const getUniqueProjetos = useCallback(() => {
    return [...new Set(projetos.map(p => p.projeto))].sort();
  }, [projetos]);

  const getUniqueResponsaveis = useCallback(() => {
    const all = new Set<string>();
    tarefas.forEach(t => {
      getTaskResourceNames(t).forEach(r => {
        const trimmed = r.trim();
        if (trimmed) all.add(trimmed);
      });
    });
    return Array.from(all).sort();
  }, [tarefas]);

  return (
    <DataContext.Provider
      value={{
        businessUnits,
        produtos,
        projetos, tarefas, recursos,
        setBusinessUnits,
        setProdutos,
        setProjetos, setTarefas, setRecursos,
        getUniqueProjetos, getUniqueResponsaveis,
        refreshAll, refreshProjetos, refreshProdutos, refreshTarefas, refreshRecursos, refreshBusinessUnits,
        loading,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}

export { getStatusColor, formatCurrency };
