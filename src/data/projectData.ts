export interface Projeto {
  id: number;
  projectId?: string;
  projectType?: string;
  businessUnitId?: number;
  businessUnitName?: string;
  produtoId?: number;
  produtoName?: string;
  projeto: string;
  descricao: string;
  prioridade: string;
  responsavel: string;
  ftes: number;
  valorPrevisto: number;
  valorGasto: number;
  dataInicioPlanej: string;
  dataFimPlanej: string;
  dataInicio: string;
  dataFimReal: string;
  totalTarefas: number;
  tarefasConcluidas: number;
  tarefasAndamento: number;
  tarefasAtrasadas: number;
  tarefasNaoIniciadas: number;
  status: string;
  conclusao: number;
}

export interface BusinessUnit {
  id?: number;
  nome: string;
  head: string;
  liderTec: string;
  liderOp: string;
  comercial: string;
}

export interface Produto {
  id?: number;
  nome: string;
  businessUnitId?: number;
  businessUnitName?: string;
}

export interface Alocacao {
  id?: number;
  taskId: string;
  projeto?: string;
  tarefa?: string;
  wbs?: string;
  taskStatus?: string;
  resourceId?: number;
  resourceName: string;
  units: number;
  work: number;
  actualWork: number;
  remainingWork: number;
  cost: number;
}

export interface Comentario {
  id?: number;
  entityType: "projeto" | "tarefa";
  projectId?: number;
  projectName?: string;
  taskId?: string;
  taskName?: string;
  authorUserId?: number;
  authorName?: string;
  content: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AuditLog {
  id?: number;
  entityType: string;
  entityId: string;
  action: string;
  actorUserId?: number;
  actorName?: string;
  actorRole?: string;
  projectId?: number;
  summary: string;
  beforeJson?: string;
  afterJson?: string;
  createdAt?: string;
}

export interface Tarefa {
  id: string;
  parentId: string;
  externalId?: string;
  wbs?: string;
  outlineLevel?: number;
  sortOrder?: number;
  projeto: string;
  tarefa: string;
  subtarefa: string;
  responsavel: string;
  funcao: string;
  dataInicioPlanej: string;
  esforcoPlanej: number;
  dataFimPlanej: string;
  dataInicioReal: string;
  esforcoReal: number;
  dataFimReal: string;
  percentual: number;
  status: string;
  taskType?: string;
  milestone?: boolean;
  durationMinutes?: number;
  isManual?: boolean;
  constraintType?: string;
  constraintDate?: string;
  notes?: string;
  valorPrevisto: number;
  valorGasto: number;
  diasPlanejados: number;
  diasReal: number;
  diasCompletados: number;
  assignments?: {
    id?: number;
    resourceId?: number;
    resourceName: string;
    units: number;
    work: number;
    actualWork: number;
    remainingWork: number;
    cost: number;
  }[];
  predecessors?: {
    id?: number;
    predecessorTaskId: string;
    type: string;
    lagMinutes: number;
  }[];
}

export interface Recurso {
  externalId?: string;
  nome: string;
  funcao: string;
  seniority?: string;
  specialties?: string[];
  resourceType?: string;
  initials?: string;
  maxUnits?: number;
  standardRate?: number;
  overtimeRate?: number;
  email?: string;
}

export const businessUnits: BusinessUnit[] = [
  {
    id: 1,
    nome: "Corporativo",
    head: "Claudio Gonçalves",
    liderTec: "Flávio Costa",
    liderOp: "Almedson Ferreira",
    comercial: "David Cunha",
  },
];

export const produtos: Produto[] = [];

const rawProjetos: Projeto[] = [
  { id: 1, projeto: "Hering-BTG", descricao: "HERING_eFCS Bank - Banco BTG Pactual", prioridade: "2- Média", responsavel: "Claudio Gonçalves", ftes: 0.5, valorPrevisto: 200, valorGasto: 200, dataInicioPlanej: "", dataFimPlanej: "", dataInicio: "12/3/25", dataFimReal: "Em andamento", totalTarefas: 2, tarefasConcluidas: 0, tarefasAndamento: 0, tarefasAtrasadas: 2, tarefasNaoIniciadas: 0, status: "Atrasado", conclusao: 0 },
  { id: 2, projeto: "HERING - Portal", descricao: "HERING - Portal de Fornecedores", prioridade: "2- Média", responsavel: "Claudio Gonçalves", ftes: 3, valorPrevisto: 600, valorGasto: 600, dataInicioPlanej: "", dataFimPlanej: "", dataInicio: "1/16/26", dataFimReal: "Em andamento", totalTarefas: 6, tarefasConcluidas: 0, tarefasAndamento: 0, tarefasAtrasadas: 6, tarefasNaoIniciadas: 0, status: "Atrasado", conclusao: 0 },
  { id: 3, projeto: "Jacto - Taxes", descricao: "JACTO_NovoCronograma_TAXES", prioridade: "2- Média", responsavel: "Claudio Gonçalves", ftes: 2, valorPrevisto: 700, valorGasto: 700, dataInicioPlanej: "", dataFimPlanej: "", dataInicio: "5/2/25", dataFimReal: "Em andamento", totalTarefas: 12, tarefasConcluidas: 0, tarefasAndamento: 3, tarefasAtrasadas: 6, tarefasNaoIniciadas: 3, status: "Atrasado", conclusao: 0 },
  { id: 4, projeto: "Marcopolo - Taxes", descricao: "MARCOPOLO_eFCS_TAXES", prioridade: "2- Média", responsavel: "Claudio Gonçalves", ftes: 4, valorPrevisto: 8200, valorGasto: 8200, dataInicioPlanej: "", dataFimPlanej: "", dataInicio: "12/3/25", dataFimReal: "Em andamento", totalTarefas: 82, tarefasConcluidas: 0, tarefasAndamento: 0, tarefasAtrasadas: 13, tarefasNaoIniciadas: 69, status: "Atrasado", conclusao: 0 },
  { id: 5, projeto: "SGS - BMS", descricao: "SGS - Timesheet BMS", prioridade: "2- Média", responsavel: "David Cunha", ftes: 3, valorPrevisto: 1200, valorGasto: 1200, dataInicioPlanej: "", dataFimPlanej: "", dataInicio: "1/14/26", dataFimReal: "Em andamento", totalTarefas: 12, tarefasConcluidas: 0, tarefasAndamento: 0, tarefasAtrasadas: 12, tarefasNaoIniciadas: 0, status: "Atrasado", conclusao: 0 },
  { id: 6, projeto: "Jarvis - CTM", descricao: "Produto Gestão de Serviços de Construção (CTM)", prioridade: "2- Média", responsavel: "Flávio Costa", ftes: 4, valorPrevisto: 32362.48, valorGasto: 0, dataInicioPlanej: "", dataFimPlanej: "", dataInicio: "4/15/25", dataFimReal: "Em andamento", totalTarefas: 106, tarefasConcluidas: 0, tarefasAndamento: 0, tarefasAtrasadas: 106, tarefasNaoIniciadas: 0, status: "Atrasado", conclusao: 0 },
  { id: 7, projeto: "Jarvis - Educa", descricao: "REESTRUTURAÇÃO DO PROJETO EDUCA BANCÁRIO", prioridade: "2- Média", responsavel: "Flávio Costa", ftes: 1, valorPrevisto: 4404.38, valorGasto: 0, dataInicioPlanej: "", dataFimPlanej: "", dataInicio: "7/22/25", dataFimReal: "Em andamento", totalTarefas: 17, tarefasConcluidas: 0, tarefasAndamento: 0, tarefasAtrasadas: 17, tarefasNaoIniciadas: 0, status: "Atrasado", conclusao: 0 },
  { id: 8, projeto: "Jarvis - PCD", descricao: "Projeto PCD", prioridade: "2- Média", responsavel: "Flávio Costa", ftes: 3, valorPrevisto: 12231.52, valorGasto: 0, dataInicioPlanej: "", dataFimPlanej: "", dataInicio: "6/9/25", dataFimReal: "Em andamento", totalTarefas: 56, tarefasConcluidas: 0, tarefasAndamento: 0, tarefasAtrasadas: 56, tarefasNaoIniciadas: 0, status: "Atrasado", conclusao: 0 },
  { id: 9, projeto: "Jarvis - B3", descricao: "Projeto B3", prioridade: "2- Média", responsavel: "Flávio Costa", ftes: 5, valorPrevisto: 7297.36, valorGasto: 0, dataInicioPlanej: "", dataFimPlanej: "", dataInicio: "6/2/25", dataFimReal: "Em andamento", totalTarefas: 20, tarefasConcluidas: 0, tarefasAndamento: 0, tarefasAtrasadas: 20, tarefasNaoIniciadas: 0, status: "Atrasado", conclusao: 0 },
  { id: 10, projeto: "NORMAN", descricao: "Automação de Reuniões com IA", prioridade: "2- Média", responsavel: "Almedson Ferreira", ftes: 1, valorPrevisto: 0, valorGasto: 0, dataInicioPlanej: "", dataFimPlanej: "", dataInicio: "Não iniciado", dataFimReal: "", totalTarefas: 0, tarefasConcluidas: 0, tarefasAndamento: 0, tarefasAtrasadas: 0, tarefasNaoIniciadas: 0, status: "Concluído", conclusao: 0 },
];

export const projetos: Projeto[] = rawProjetos.map((projeto) => ({
  ...projeto,
  projectType: projeto.projectType || "Projeto",
  businessUnitId: projeto.businessUnitId || 1,
  businessUnitName: projeto.businessUnitName || "Corporativo",
  produtoId: projeto.produtoId,
  produtoName: projeto.produtoName || "",
}));

export const tarefas: Tarefa[] = [
  { id: "1.1", parentId: "", projeto: "Hering-BTG", tarefa: "Encerramento - Subir para PRD", subtarefa: "", responsavel: "Cliente", funcao: "TI", dataInicioPlanej: "12/3/25", esforcoPlanej: 0.5, dataFimPlanej: "12/3/25", dataInicioReal: "", esforcoReal: 0, dataFimReal: "", percentual: 0, status: "Atrasado", valorPrevisto: 100, valorGasto: 100, diasPlanejados: 0, diasReal: 0, diasCompletados: 0 },
  { id: "1.2", parentId: "", projeto: "Hering-BTG", tarefa: "Termo de Aceite do Projeto", subtarefa: "", responsavel: "Claudio Gonçalves", funcao: "Gerente de Projeto", dataInicioPlanej: "12/3/25", esforcoPlanej: 0.5, dataFimPlanej: "12/3/25", dataInicioReal: "", esforcoReal: 0, dataFimReal: "", percentual: 0, status: "Atrasado", valorPrevisto: 100, valorGasto: 100, diasPlanejados: 0, diasReal: 0, diasCompletados: 0 },
  { id: "2.1", parentId: "", projeto: "HERING - Portal", tarefa: "Testes Integrados - Ajustes após testes", subtarefa: "", responsavel: "SAP FI;ABAP;JAVA-2", funcao: "Infra", dataInicioPlanej: "11/4/25", esforcoPlanej: 53, dataFimPlanej: "1/16/26", dataInicioReal: "1/16/26", esforcoReal: 53, dataFimReal: "4/1/26", percentual: 40, status: "Atrasado", valorPrevisto: 100, valorGasto: 100, diasPlanejados: 73, diasReal: 75, diasCompletados: 75 },
  { id: "2.2", parentId: "", projeto: "HERING - Portal", tarefa: "Testes Integrados", subtarefa: "", responsavel: "Cliente", funcao: "Cliente Tester", dataInicioPlanej: "1/19/26", esforcoPlanej: 5, dataFimPlanej: "1/26/26", dataInicioReal: "", esforcoReal: 0, dataFimReal: "", percentual: 0, status: "Atrasado", valorPrevisto: 100, valorGasto: 100, diasPlanejados: 7, diasReal: 7, diasCompletados: 0 },
  { id: "2.3", parentId: "", projeto: "HERING - Portal", tarefa: "Plano de Cutover", subtarefa: "", responsavel: "Claudio Gonçalves", funcao: "Gerente de Projeto", dataInicioPlanej: "1/26/26", esforcoPlanej: 0.5, dataFimPlanej: "1/26/26", dataInicioReal: "", esforcoReal: 0, dataFimReal: "", percentual: 0, status: "Atrasado", valorPrevisto: 100, valorGasto: 100, diasPlanejados: 0, diasReal: 0, diasCompletados: 0 },
  { id: "2.4", parentId: "", projeto: "HERING - Portal", tarefa: "Configuração PI para PRD", subtarefa: "", responsavel: "Diego Brito", funcao: "SAP - PI/PO", dataInicioPlanej: "1/27/26", esforcoPlanej: 0.5, dataFimPlanej: "1/27/26", dataInicioReal: "", esforcoReal: 0, dataFimReal: "", percentual: 0, status: "Atrasado", valorPrevisto: 100, valorGasto: 100, diasPlanejados: 0, diasReal: 0, diasCompletados: 0 },
  { id: "2.5", parentId: "", projeto: "HERING - Portal", tarefa: "Transporte Requests para PRD", subtarefa: "", responsavel: "Cliente", funcao: "TI", dataInicioPlanej: "1/27/26", esforcoPlanej: 0.25, dataFimPlanej: "1/27/26", dataInicioReal: "", esforcoReal: 0, dataFimReal: "", percentual: 0, status: "Atrasado", valorPrevisto: 100, valorGasto: 100, diasPlanejados: 0, diasReal: 0, diasCompletados: 0 },
  { id: "2.6", parentId: "", projeto: "HERING - Portal", tarefa: "Subida para PRD", subtarefa: "", responsavel: "André Alves", funcao: "Java - Sênior", dataInicioPlanej: "1/27/26", esforcoPlanej: 0.25, dataFimPlanej: "1/27/26", dataInicioReal: "", esforcoReal: 0, dataFimReal: "", percentual: 0, status: "Atrasado", valorPrevisto: 100, valorGasto: 100, diasPlanejados: 0, diasReal: 0, diasCompletados: 0 },
  { id: "3.1", parentId: "", projeto: "Jacto - Taxes", tarefa: "Reunião para realinhamento das funcionalidades", subtarefa: "", responsavel: "André Alves; André Guizelini; Igor Cípola; Key user-cliente", funcao: "", dataInicioPlanej: "5/2/25", esforcoPlanej: 0.25, dataFimPlanej: "5/2/25", dataInicioReal: "", esforcoReal: 0, dataFimReal: "", percentual: 0, status: "Atrasado", valorPrevisto: 100, valorGasto: 100, diasPlanejados: 0, diasReal: 0, diasCompletados: 0 },
  { id: "3.2", parentId: "", projeto: "Jacto - Taxes", tarefa: "Testes integrados - eFCS", subtarefa: "", responsavel: "Igor Cípola", funcao: "Java - Pleno", dataInicioPlanej: "1/7/26", esforcoPlanej: 17, dataFimPlanej: "1/30/26", dataInicioReal: "1/7/26", esforcoReal: 17, dataFimReal: "1/30/26", percentual: 10, status: "Em andamento", valorPrevisto: 100, valorGasto: 100, diasPlanejados: 23, diasReal: 23, diasCompletados: 23 },
  { id: "3.3", parentId: "", projeto: "Jacto - Taxes", tarefa: "Testes integrados - SAP", subtarefa: "", responsavel: "André Guizelini", funcao: "SAP - Analista Funcional", dataInicioPlanej: "1/7/26", esforcoPlanej: 17, dataFimPlanej: "1/30/26", dataInicioReal: "1/7/26", esforcoReal: 17, dataFimReal: "1/30/26", percentual: 10, status: "Em andamento", valorPrevisto: 100, valorGasto: 100, diasPlanejados: 23, diasReal: 23, diasCompletados: 23 },
  { id: "3.4", parentId: "", projeto: "Jacto - Taxes", tarefa: "Testes integrados - Cliente", subtarefa: "", responsavel: "Cliente", funcao: "Cliente Tester", dataInicioPlanej: "1/7/26", esforcoPlanej: 17, dataFimPlanej: "1/30/26", dataInicioReal: "1/7/26", esforcoReal: 17, dataFimReal: "1/30/26", percentual: 10, status: "Em andamento", valorPrevisto: 100, valorGasto: 100, diasPlanejados: 23, diasReal: 23, diasCompletados: 23 },
  { id: "3.5", parentId: "", projeto: "Jacto - Taxes", tarefa: "Preparar para Cutover", subtarefa: "", responsavel: "Claudio Gonçalves", funcao: "Gerente de Projeto", dataInicioPlanej: "1/30/26", esforcoPlanej: 0.25, dataFimPlanej: "1/30/26", dataInicioReal: "", esforcoReal: 0, dataFimReal: "", percentual: 0, status: "Não iniciado", valorPrevisto: 100, valorGasto: 100, diasPlanejados: 0, diasReal: 0, diasCompletados: 0 },
  { id: "3.6", parentId: "", projeto: "Jacto - Taxes", tarefa: "Ajustes técnicos (Hardware, SO, Rede)", subtarefa: "", responsavel: "Igor Cípola;André Guizelini", funcao: "Variadas", dataInicioPlanej: "1/30/26", esforcoPlanej: 0.25, dataFimPlanej: "1/30/26", dataInicioReal: "", esforcoReal: 0, dataFimReal: "", percentual: 0, status: "Não iniciado", valorPrevisto: 100, valorGasto: 100, diasPlanejados: 0, diasReal: 0, diasCompletados: 0 },
  { id: "3.7", parentId: "", projeto: "Jacto - Taxes", tarefa: "Instalação em produção", subtarefa: "", responsavel: "Cliente", funcao: "TI", dataInicioPlanej: "2/2/26", esforcoPlanej: 0.5, dataFimPlanej: "2/2/26", dataInicioReal: "", esforcoReal: 0, dataFimReal: "", percentual: 0, status: "Não iniciado", valorPrevisto: 100, valorGasto: 100, diasPlanejados: 0, diasReal: 0, diasCompletados: 0 },
  { id: "4.1", parentId: "", projeto: "Marcopolo - Taxes", tarefa: "Atendimento as solicitações preliminares", subtarefa: "", responsavel: "Cliente", funcao: "Gerente de Projeto", dataInicioPlanej: "11/28/25", esforcoPlanej: 3, dataFimPlanej: "12/3/25", dataInicioReal: "11/28/25", esforcoReal: 3, dataFimReal: "12/3/25", percentual: 10, status: "Atrasado", valorPrevisto: 100, valorGasto: 100, diasPlanejados: 5, diasReal: 5, diasCompletados: 5 },
  { id: "4.2", parentId: "", projeto: "Marcopolo - Taxes", tarefa: "Reunião de entendimento - guias de antecipação", subtarefa: "", responsavel: "Claudio Gonçalves;GP-cliente;Igor Cípola;Key user-cliente", funcao: "Variadas", dataInicioPlanej: "12/30/25", esforcoPlanej: 0.25, dataFimPlanej: "12/30/25", dataInicioReal: "", esforcoReal: 0, dataFimReal: "", percentual: 0, status: "Atrasado", valorPrevisto: 100, valorGasto: 100, diasPlanejados: 0, diasReal: 0, diasCompletados: 0 },
  { id: "4.3", parentId: "", projeto: "Marcopolo - Taxes", tarefa: "Realização do Kickoff", subtarefa: "", responsavel: "Claudio Gonçalves;GP-cliente", funcao: "Variadas", dataInicioPlanej: "1/19/26", esforcoPlanej: 0.5, dataFimPlanej: "1/19/26", dataInicioReal: "", esforcoReal: 0, dataFimReal: "", percentual: 50, status: "Atrasado", valorPrevisto: 100, valorGasto: 100, diasPlanejados: 0, diasReal: 0, diasCompletados: 0 },
  { id: "4.4", parentId: "", projeto: "Marcopolo - Taxes", tarefa: "Assessment no ambiente SAP do cliente", subtarefa: "", responsavel: "André Guizelini", funcao: "SAP - Analista Funcional", dataInicioPlanej: "1/20/26", esforcoPlanej: 1, dataFimPlanej: "1/21/26", dataInicioReal: "", esforcoReal: 0, dataFimReal: "", percentual: 0, status: "Atrasado", valorPrevisto: 100, valorGasto: 100, diasPlanejados: 1, diasReal: 1, diasCompletados: 0 },
  { id: "4.5", parentId: "", projeto: "Marcopolo - Taxes", tarefa: "Definir novos processos de negócio - SAP", subtarefa: "", responsavel: "André Guizelini", funcao: "SAP - Analista Funcional", dataInicioPlanej: "1/21/26", esforcoPlanej: 1, dataFimPlanej: "1/22/26", dataInicioReal: "", esforcoReal: 0, dataFimReal: "", percentual: 0, status: "Atrasado", valorPrevisto: 100, valorGasto: 100, diasPlanejados: 1, diasReal: 1, diasCompletados: 0 },
  { id: "4.6", parentId: "", projeto: "Marcopolo - Taxes", tarefa: "Definir novos processos de negócio - EFCS", subtarefa: "", responsavel: "Igor Cípola", funcao: "Java - Pleno", dataInicioPlanej: "1/19/26", esforcoPlanej: 1, dataFimPlanej: "1/20/26", dataInicioReal: "", esforcoReal: 0, dataFimReal: "", percentual: 0, status: "Atrasado", valorPrevisto: 100, valorGasto: 100, diasPlanejados: 1, diasReal: 1, diasCompletados: 0 },
  { id: "4.7", parentId: "", projeto: "Marcopolo - Taxes", tarefa: "Business BluePrint - SAP", subtarefa: "", responsavel: "André Guizelini", funcao: "SAP - Analista Funcional", dataInicioPlanej: "1/23/26", esforcoPlanej: 1, dataFimPlanej: "1/26/26", dataInicioReal: "", esforcoReal: 0, dataFimReal: "", percentual: 0, status: "Atrasado", valorPrevisto: 100, valorGasto: 100, diasPlanejados: 3, diasReal: 3, diasCompletados: 0 },
  { id: "4.8", parentId: "", projeto: "Marcopolo - Taxes", tarefa: "Business BluePrint - EFCS", subtarefa: "", responsavel: "Igor Cípola", funcao: "Java - Pleno", dataInicioPlanej: "1/20/26", esforcoPlanej: 1, dataFimPlanej: "1/21/26", dataInicioReal: "", esforcoReal: 0, dataFimReal: "", percentual: 0, status: "Atrasado", valorPrevisto: 100, valorGasto: 100, diasPlanejados: 1, diasReal: 1, diasCompletados: 0 },
  { id: "5.1", parentId: "", projeto: "SGS - BMS", tarefa: "Fornecer acessos", subtarefa: "", responsavel: "Cliente", funcao: "TI", dataInicioPlanej: "1/9/26", esforcoPlanej: 3, dataFimPlanej: "1/14/26", dataInicioReal: "", esforcoReal: 0, dataFimReal: "", percentual: 0, status: "Atrasado", valorPrevisto: 100, valorGasto: 100, diasPlanejados: 5, diasReal: 5, diasCompletados: 0 },
  { id: "5.2", parentId: "", projeto: "SGS - BMS", tarefa: "Validar acessos", subtarefa: "", responsavel: "Igor Cípola", funcao: "Java - Pleno", dataInicioPlanej: "1/14/26", esforcoPlanej: 2, dataFimPlanej: "1/16/26", dataInicioReal: "", esforcoReal: 0, dataFimReal: "", percentual: 0, status: "Atrasado", valorPrevisto: 100, valorGasto: 100, diasPlanejados: 2, diasReal: 2, diasCompletados: 0 },
  { id: "5.3", parentId: "", projeto: "SGS - BMS", tarefa: "WebService de Envio ao ERP", subtarefa: "", responsavel: "Igor Cípola", funcao: "Java - Pleno", dataInicioPlanej: "1/16/26", esforcoPlanej: 4, dataFimPlanej: "1/22/26", dataInicioReal: "", esforcoReal: 0, dataFimReal: "", percentual: 0, status: "Atrasado", valorPrevisto: 100, valorGasto: 100, diasPlanejados: 6, diasReal: 6, diasCompletados: 0 },
  { id: "6.1", parentId: "", projeto: "Jarvis - CTM", tarefa: "Tela de Login", subtarefa: "", responsavel: "Ezequiel Lobo", funcao: "Mobile - Júnior", dataInicioPlanej: "4/14/25", esforcoPlanej: 1, dataFimPlanej: "4/15/25", dataInicioReal: "", esforcoReal: 0, dataFimReal: "", percentual: 0, status: "Atrasado", valorPrevisto: 140.48, valorGasto: 0, diasPlanejados: 1, diasReal: 1, diasCompletados: 0 },
  { id: "6.2", parentId: "", projeto: "Jarvis - CTM", tarefa: "Tela Controle de Efetivo", subtarefa: "", responsavel: "Ezequiel Lobo", funcao: "Mobile - Júnior", dataInicioPlanej: "4/15/25", esforcoPlanej: 1.5, dataFimPlanej: "4/16/25", dataInicioReal: "", esforcoReal: 0, dataFimReal: "", percentual: 0, status: "Atrasado", valorPrevisto: 210.72, valorGasto: 0, diasPlanejados: 1, diasReal: 1, diasCompletados: 0 },
  { id: "6.3", parentId: "", projeto: "Jarvis - CTM", tarefa: "Tela Controle de Medição", subtarefa: "", responsavel: "Ezequiel Lobo", funcao: "Mobile - Júnior", dataInicioPlanej: "4/17/25", esforcoPlanej: 1.5, dataFimPlanej: "4/18/25", dataInicioReal: "", esforcoReal: 0, dataFimReal: "", percentual: 0, status: "Atrasado", valorPrevisto: 210.72, valorGasto: 0, diasPlanejados: 1, diasReal: 1, diasCompletados: 0 },
  { id: "7.1", parentId: "", projeto: "Jarvis - Educa", tarefa: "Implementar service", subtarefa: "", responsavel: "Eduardo Freitas;Israel Machado;Julia Marinetto", funcao: "Variadas", dataInicioPlanej: "7/22/25", esforcoPlanej: 0.25, dataFimPlanej: "7/22/25", dataInicioReal: "", esforcoReal: 0, dataFimReal: "", percentual: 95, status: "Atrasado", valorPrevisto: 36.38, valorGasto: 0, diasPlanejados: 0, diasReal: 0, diasCompletados: 0 },
  { id: "7.6", parentId: "", projeto: "Jarvis - Educa", tarefa: "Incluir alunos após confirmação de pagamento", subtarefa: "", responsavel: "Flávio Costa", funcao: "Java - Sênior", dataInicioPlanej: "7/30/25", esforcoPlanej: 1, dataFimPlanej: "7/31/25", dataInicioReal: "", esforcoReal: 0, dataFimReal: "", percentual: 0, status: "Atrasado", valorPrevisto: 624, valorGasto: 0, diasPlanejados: 1, diasReal: 1, diasCompletados: 0 },
  { id: "8.1", parentId: "", projeto: "Jarvis - PCD", tarefa: "Levantamento do escopo/necessidades", subtarefa: "", responsavel: "Flávio Costa;Robson Oliveira", funcao: "Variadas", dataInicioPlanej: "6/9/25", esforcoPlanej: 0.5, dataFimPlanej: "6/9/25", dataInicioReal: "", esforcoReal: 0, dataFimReal: "", percentual: 0, status: "Atrasado", valorPrevisto: 373.80, valorGasto: 0, diasPlanejados: 0, diasReal: 0, diasCompletados: 0 },
  { id: "8.2", parentId: "", projeto: "Jarvis - PCD", tarefa: "Elaboração do Cronograma", subtarefa: "", responsavel: "Claudio Gonçalves", funcao: "Gerente de Projeto", dataInicioPlanej: "6/9/25", esforcoPlanej: 0.5, dataFimPlanej: "6/9/25", dataInicioReal: "", esforcoReal: 0, dataFimReal: "", percentual: 0, status: "Atrasado", valorPrevisto: 130.28, valorGasto: 0, diasPlanejados: 0, diasReal: 0, diasCompletados: 0 },
  { id: "9.1", parentId: "", projeto: "Jarvis - B3", tarefa: "Levantamento do escopo/necessidades", subtarefa: "", responsavel: "Flávio Costa;Robson Oliveira", funcao: "Variadas", dataInicioPlanej: "6/2/25", esforcoPlanej: 0.5, dataFimPlanej: "6/2/25", dataInicioReal: "", esforcoReal: 0, dataFimReal: "", percentual: 0, status: "Atrasado", valorPrevisto: 373.80, valorGasto: 0, diasPlanejados: 0, diasReal: 0, diasCompletados: 0 },
  { id: "9.2", parentId: "", projeto: "Jarvis - B3", tarefa: "Elaboração do Cronograma", subtarefa: "", responsavel: "Claudio Gonçalves", funcao: "Gerente de Projeto", dataInicioPlanej: "6/2/25", esforcoPlanej: 0.5, dataFimPlanej: "6/2/25", dataInicioReal: "", esforcoReal: 0, dataFimReal: "", percentual: 0, status: "Atrasado", valorPrevisto: 130.28, valorGasto: 0, diasPlanejados: 0, diasReal: 0, diasCompletados: 0 },
];

export const recursos: Recurso[] = [
  { nome: "Almedson Ferreira", funcao: "Gerente de Projeto" },
  { nome: "André Alves", funcao: "Java - Sênior" },
  { nome: "André Guizelini", funcao: "SAP - Analista Funcional" },
  { nome: "Claudio Gonçalves", funcao: "Gerente de Projeto" },
  { nome: "Cleber Lopes", funcao: "BI Analyst" },
  { nome: "Cliente", funcao: "TI" },
  { nome: "David Cunha", funcao: "Comercial" },
  { nome: "Diego Brito", funcao: "SAP - PI/PO" },
  { nome: "Eduardo Cassiano", funcao: "SAP - ABAP" },
  { nome: "Eduardo Freitas", funcao: "BI Analyst" },
  { nome: "Eduardo Siqueira", funcao: "Java - Pleno" },
  { nome: "Ezequiel Lobo", funcao: "Mobile - Júnior" },
  { nome: "Flávio Costa", funcao: "Java - Sênior" },
  { nome: "Igor Cípola", funcao: "Java - Pleno" },
  { nome: "Israel Machado", funcao: "Java - Pleno" },
  { nome: "Julia Marinetto", funcao: "" },
  { nome: "Key user-cliente", funcao: "Java - Júnior" },
  { nome: "Letson Galdino", funcao: "" },
  { nome: "Lucas Ramos", funcao: "" },
  { nome: "Maria Helena", funcao: "Angular - Júnior" },
  { nome: "Paulo Rogério", funcao: "Gerente de Projeto" },
  { nome: "Robson Oliveira", funcao: "Infra" },
];

export function getUniqueResponsaveis(): string[] {
  const all = new Set<string>();
  tarefas.forEach(t => {
    t.responsavel.split(";").forEach(r => {
      const trimmed = r.trim();
      if (trimmed) all.add(trimmed);
    });
  });
  return Array.from(all).sort();
}

export function getUniqueProjetos(): string[] {
  return [...new Set(projetos.map(p => p.projeto))].sort();
}

export function getStatusColor(status: string): string {
  switch (status) {
    case "Atrasado": return "destructive";
    case "Em andamento": return "warning";
    case "Não iniciado": return "secondary";
    case "Concluído": return "success";
    default: return "secondary";
  }
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}
