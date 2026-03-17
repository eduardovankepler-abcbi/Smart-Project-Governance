export type UserRole = "admin" | "pmo" | "bi" | "viewer";

export interface AuthUser {
  id: number;
  nome: string;
  email: string;
  role: UserRole;
  roleLabel: string;
  active: boolean;
  assignedProjectIds: number[];
  linkedResourceId?: number;
  linkedResourceName?: string;
}

export interface UserAccount extends AuthUser {
  password?: string;
}
