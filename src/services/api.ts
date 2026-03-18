import { API_BASE_URL, isApiEnabled } from "@/config/api";
import type { Projeto, Tarefa, Recurso, BusinessUnit, Produto, Alocacao, Comentario, AuditLog } from "@/data/projectData";
import type { AuthUser, UserAccount } from "@/types/auth";
import {
  businessUnits as localBusinessUnits,
  produtos as localProdutos,
  projetos as localProjetos,
  tarefas as localTarefas,
  recursos as localRecursos,
} from "@/data/projectData";

export interface ProjectBaseline {
  id: number;
  projectId: number;
  projectName: string;
  projectCode: string;
  baselineNumber: number;
  baselineName: string;
  sourceType: "project_create" | "xml_import" | "manual" | "replan";
  status: "pending_approval" | "approved" | "rejected";
  isOfficial: boolean;
  justification: string;
  approvalNotes: string;
  requestedByUserId?: number;
  requestedByName: string;
  requestedByRole: string;
  approvedByUserId?: number;
  approvedByName: string;
  approvedAt?: string;
  taskCount: number;
  totalPlannedEffort: number;
  totalPlannedCost: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface CurvePoint {
  weekStart: string;
  weekEnd: string;
  label: string;
  planned: number;
  actual: number;
  variance: number;
}

export interface ProjectCurveSResponse {
  aggregation: "weekly";
  metric: "effort" | "cost" | "progress";
  baseline: ProjectBaseline | null;
  points: CurvePoint[];
  summary: {
    plannedTotal: number;
    actualTotal: number;
    varianceTotal: number;
  };
}

export const AUTH_TOKEN_STORAGE_KEY = "abc_pm_auth_token";

function getStoredToken(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || "";
}

function getAuthHeaders(): HeadersInit {
  const authToken = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
  return headers;
}

async function fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: { ...getAuthHeaders(), ...(options?.headers || {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `API error: ${res.status}`);
  }
  return res.json();
}

// ===== AUTH =====
export async function login(email: string, password: string): Promise<{ token: string; expiresAt: string; user: AuthUser }> {
  if (!isApiEnabled()) {
    return {
      token: "local-admin",
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      user: {
        id: 1,
        nome: "Administrador Local",
        email,
        role: "admin",
        roleLabel: "Administrador",
        active: true,
        assignedProjectIds: [],
      },
    };
  }
  return fetchJson("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
}

export async function getMe(): Promise<{ user: AuthUser }> {
  if (!isApiEnabled()) {
    return {
      user: {
        id: 1,
        nome: "Administrador Local",
        email: "local@abc",
        role: "admin",
        roleLabel: "Administrador",
        active: true,
        assignedProjectIds: [],
      },
    };
  }
  return fetchJson("/api/auth/me");
}

export async function logout(): Promise<void> {
  if (!isApiEnabled()) return;
  await fetchJson("/api/auth/logout", { method: "POST" });
}

export async function changePassword(currentPassword: string, nextPassword: string): Promise<void> {
  if (!isApiEnabled()) throw new Error("API não configurada");
  await fetchJson("/api/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, nextPassword }),
  });
}

// ===== USERS =====
export async function getUsers(): Promise<UserAccount[]> {
  if (!isApiEnabled()) return [];
  return fetchJson<UserAccount[]>("/api/users");
}

export async function createUser(data: {
  nome: string;
  email: string;
  password: string;
  role: AuthUser["role"];
  assignedProjectIds: number[];
  linkedResourceId?: number;
}): Promise<UserAccount> {
  if (!isApiEnabled()) throw new Error("API não configurada");
  return fetchJson("/api/users", { method: "POST", body: JSON.stringify(data) });
}

export async function updateUser(id: number, data: {
  nome: string;
  email: string;
  password?: string;
  role: AuthUser["role"];
  active: boolean;
  assignedProjectIds: number[];
  linkedResourceId?: number;
}): Promise<UserAccount> {
  if (!isApiEnabled()) throw new Error("API não configurada");
  return fetchJson(`/api/users/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export async function deleteUser(id: number): Promise<void> {
  if (!isApiEnabled()) throw new Error("API não configurada");
  await fetchJson(`/api/users/${id}`, { method: "DELETE" });
}

export async function resetUserPassword(id: number, password: string): Promise<void> {
  if (!isApiEnabled()) throw new Error("API não configurada");
  await fetchJson(`/api/users/${id}/reset-password`, {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

// ===== BUSINESS UNITS =====
export async function getBusinessUnits(): Promise<(BusinessUnit & { id?: number })[]> {
  if (!isApiEnabled()) return localBusinessUnits;
  return fetchJson<(BusinessUnit & { id: number })[]>("/api/business-units");
}

export async function createBusinessUnit(data: BusinessUnit): Promise<BusinessUnit & { id: number }> {
  if (!isApiEnabled()) throw new Error("API não configurada");
  return fetchJson("/api/business-units", { method: "POST", body: JSON.stringify(data) });
}

export async function updateBusinessUnit(id: number, data: BusinessUnit): Promise<BusinessUnit & { id: number }> {
  if (!isApiEnabled()) throw new Error("API não configurada");
  return fetchJson(`/api/business-units/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export async function deleteBusinessUnit(id: number): Promise<void> {
  if (!isApiEnabled()) throw new Error("API não configurada");
  await fetchJson(`/api/business-units/${id}`, { method: "DELETE" });
}

// ===== PRODUTOS =====
export async function getProdutos(): Promise<(Produto & { id?: number })[]> {
  if (!isApiEnabled()) return localProdutos;
  return fetchJson<(Produto & { id: number })[]>("/api/produtos");
}

export async function createProduto(data: Produto): Promise<Produto & { id: number }> {
  if (!isApiEnabled()) throw new Error("API não configurada");
  return fetchJson("/api/produtos", { method: "POST", body: JSON.stringify(data) });
}

export async function updateProduto(id: number, data: Produto): Promise<Produto & { id: number }> {
  if (!isApiEnabled()) throw new Error("API não configurada");
  return fetchJson(`/api/produtos/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export async function deleteProduto(id: number): Promise<void> {
  if (!isApiEnabled()) throw new Error("API não configurada");
  await fetchJson(`/api/produtos/${id}`, { method: "DELETE" });
}

// ===== PROJETOS =====
export async function getProjetos(): Promise<Projeto[]> {
  if (!isApiEnabled()) return localProjetos;
  return fetchJson<Projeto[]>("/api/projetos");
}

export async function createProjeto(data: Omit<Projeto, "id">): Promise<Projeto> {
  if (!isApiEnabled()) throw new Error("API não configurada");
  return fetchJson<Projeto>("/api/projetos", { method: "POST", body: JSON.stringify(data) });
}

export async function updateProjeto(id: number, data: Partial<Projeto>): Promise<Projeto> {
  if (!isApiEnabled()) throw new Error("API não configurada");
  return fetchJson<Projeto>(`/api/projetos/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export async function deleteProjeto(id: number): Promise<void> {
  if (!isApiEnabled()) throw new Error("API não configurada");
  await fetchJson(`/api/projetos/${id}`, { method: "DELETE" });
}

// ===== TAREFAS =====
export async function getTarefas(): Promise<Tarefa[]> {
  if (!isApiEnabled()) return localTarefas;
  return fetchJson<Tarefa[]>("/api/tarefas");
}

export async function createTarefa(data: Tarefa): Promise<Tarefa> {
  if (!isApiEnabled()) throw new Error("API não configurada");
  return fetchJson<Tarefa>("/api/tarefas", { method: "POST", body: JSON.stringify(data) });
}

export async function updateTarefa(id: string, data: Partial<Tarefa>): Promise<Tarefa> {
  if (!isApiEnabled()) throw new Error("API não configurada");
  return fetchJson<Tarefa>(`/api/tarefas/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export async function deleteTarefa(id: string): Promise<void> {
  if (!isApiEnabled()) throw new Error("API não configurada");
  await fetchJson(`/api/tarefas/${id}`, { method: "DELETE" });
}

// ===== ALOCAÇÕES =====
export async function getAlocacoes(): Promise<Alocacao[]> {
  if (!isApiEnabled()) return [];
  return fetchJson<Alocacao[]>("/api/alocacoes");
}

export async function createAlocacao(data: Alocacao): Promise<Alocacao> {
  if (!isApiEnabled()) throw new Error("API não configurada");
  return fetchJson<Alocacao>("/api/alocacoes", { method: "POST", body: JSON.stringify(data) });
}

export async function updateAlocacao(id: number, data: Partial<Alocacao>): Promise<Alocacao> {
  if (!isApiEnabled()) throw new Error("API não configurada");
  return fetchJson<Alocacao>(`/api/alocacoes/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export async function deleteAlocacao(id: number): Promise<void> {
  if (!isApiEnabled()) throw new Error("API não configurada");
  await fetchJson(`/api/alocacoes/${id}`, { method: "DELETE" });
}

// ===== COMENTÁRIOS =====
export async function getComentarios(params?: { projectId?: number; taskId?: string }): Promise<Comentario[]> {
  if (!isApiEnabled()) return [];
  const query = new URLSearchParams();
  if (params?.projectId) query.set("projectId", String(params.projectId));
  if (params?.taskId) query.set("taskId", params.taskId);
  return fetchJson<Comentario[]>(`/api/comentarios${query.toString() ? `?${query.toString()}` : ""}`);
}

export async function createComentario(data: Comentario): Promise<Comentario> {
  if (!isApiEnabled()) throw new Error("API não configurada");
  return fetchJson<Comentario>("/api/comentarios", { method: "POST", body: JSON.stringify(data) });
}

export async function updateComentario(id: number, data: Partial<Comentario>): Promise<Comentario> {
  if (!isApiEnabled()) throw new Error("API não configurada");
  return fetchJson<Comentario>(`/api/comentarios/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export async function deleteComentario(id: number): Promise<void> {
  if (!isApiEnabled()) throw new Error("API não configurada");
  await fetchJson(`/api/comentarios/${id}`, { method: "DELETE" });
}

// ===== AUDITORIA =====
export async function getAuditoria(params?: { projectId?: number; entityType?: string; search?: string }): Promise<AuditLog[]> {
  if (!isApiEnabled()) return [];
  const query = new URLSearchParams();
  if (params?.projectId) query.set("projectId", String(params.projectId));
  if (params?.entityType) query.set("entityType", params.entityType);
  if (params?.search) query.set("search", params.search);
  return fetchJson<AuditLog[]>(`/api/auditoria${query.toString() ? `?${query.toString()}` : ""}`);
}

// ===== BASELINES =====
export async function getProjectBaselines(projectId?: number): Promise<ProjectBaseline[]> {
  if (!isApiEnabled()) return [];
  const query = new URLSearchParams();
  if (projectId) query.set("projectId", String(projectId));
  return fetchJson<ProjectBaseline[]>(`/api/baselines${query.toString() ? `?${query.toString()}` : ""}`);
}

export async function createProjectBaseline(data: {
  projectId: number;
  baselineName?: string;
  sourceType?: ProjectBaseline["sourceType"];
  justification?: string;
}): Promise<ProjectBaseline> {
  if (!isApiEnabled()) throw new Error("API não configurada");
  return fetchJson<ProjectBaseline>("/api/baselines", { method: "POST", body: JSON.stringify(data) });
}

export async function approveProjectBaseline(id: number, approvalNotes?: string): Promise<ProjectBaseline> {
  if (!isApiEnabled()) throw new Error("API não configurada");
  return fetchJson<ProjectBaseline>(`/api/baselines/${id}/approve`, {
    method: "POST",
    body: JSON.stringify({ approvalNotes }),
  });
}

export async function rejectProjectBaseline(id: number, approvalNotes?: string): Promise<ProjectBaseline> {
  if (!isApiEnabled()) throw new Error("API não configurada");
  return fetchJson<ProjectBaseline>(`/api/baselines/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({ approvalNotes }),
  });
}

export async function getProjectCurveS(params: {
  projectId: number;
  baselineId?: number;
  metric?: ProjectCurveSResponse["metric"];
}): Promise<ProjectCurveSResponse> {
  if (!isApiEnabled()) {
    return {
      aggregation: "weekly",
      metric: params.metric || "effort",
      baseline: null,
      points: [],
      summary: { plannedTotal: 0, actualTotal: 0, varianceTotal: 0 },
    };
  }
  const query = new URLSearchParams();
  query.set("projectId", String(params.projectId));
  if (params.baselineId) query.set("baselineId", String(params.baselineId));
  if (params.metric) query.set("metric", params.metric);
  return fetchJson<ProjectCurveSResponse>(`/api/baselines/curve-s?${query.toString()}`);
}

// ===== RECURSOS =====
export async function getRecursos(): Promise<(Recurso & { id?: number })[]> {
  if (!isApiEnabled()) return localRecursos;
  return fetchJson<(Recurso & { id: number })[]>("/api/recursos");
}

export async function createRecurso(data: Recurso): Promise<Recurso & { id: number }> {
  if (!isApiEnabled()) throw new Error("API não configurada");
  return fetchJson("/api/recursos", { method: "POST", body: JSON.stringify(data) });
}

export async function updateRecurso(id: number, data: Recurso): Promise<Recurso & { id: number }> {
  if (!isApiEnabled()) throw new Error("API não configurada");
  return fetchJson(`/api/recursos/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export async function deleteRecurso(id: number): Promise<void> {
  if (!isApiEnabled()) throw new Error("API não configurada");
  await fetchJson(`/api/recursos/${id}`, { method: "DELETE" });
}

// ===== IMPORT & HEALTH =====
export async function importExcel(file: File): Promise<{ success: boolean; imported: { projetos: number; tarefas: number; recursos: number } }> {
  if (!isApiEnabled()) throw new Error("API não configurada. Defina VITE_API_URL no .env");
  const formData = new FormData();
  formData.append("file", file);
  const authToken = getStoredToken();
  const res = await fetch(`${API_BASE_URL}/api/import-excel`, {
    method: "POST",
    body: formData,
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Erro ao importar");
  }
  return res.json();
}

export async function importMsProject(file: File): Promise<{ success: boolean; imported: { project: string; projetos: number; tarefas: number; recursos: number } }> {
  if (!isApiEnabled()) throw new Error("API não configurada. A importação do MS Project exige backend ativo.");
  const formData = new FormData();
  formData.append("file", file);
  const authToken = getStoredToken();
  const res = await fetch(`${API_BASE_URL}/api/import-ms-project`, {
    method: "POST",
    body: formData,
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Erro ao importar XML do MS Project" }));
    throw new Error(err.error || "Erro ao importar XML do MS Project");
  }
  return res.json();
}

export async function checkHealth(): Promise<{ status: string; database: string }> {
  if (!isApiEnabled()) return { status: "ok", database: "local-data" };
  return fetchJson("/api/health");
}
