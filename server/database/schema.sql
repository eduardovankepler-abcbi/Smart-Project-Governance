-- ============================================
-- ABC Technology - Project Manager Database
-- MySQL Schema + Seed Data
-- ============================================

CREATE DATABASE IF NOT EXISTS abc_project_manager
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE abc_project_manager;

DROP TABLE IF EXISTS schema_migrations;
CREATE TABLE schema_migrations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  filename VARCHAR(255) NOT NULL UNIQUE,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ============================================
-- TABELA: business_units
-- ============================================
DROP TABLE IF EXISTS business_units;
CREATE TABLE business_units (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(120) NOT NULL UNIQUE,
  head VARCHAR(120) DEFAULT '',
  lider_tec VARCHAR(120) DEFAULT '',
  lider_op VARCHAR(120) DEFAULT '',
  comercial VARCHAR(120) DEFAULT ''
) ENGINE=InnoDB;

INSERT INTO business_units (id, nome, head, lider_tec, lider_op, comercial) VALUES
(1, 'Corporativo', 'Claudio Gonçalves', 'Flávio Costa', 'Almedson Ferreira', 'David Cunha');

-- ============================================
-- TABELA: produtos
-- ============================================
DROP TABLE IF EXISTS produtos;
CREATE TABLE produtos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(160) NOT NULL,
  business_unit_id INT NOT NULL,
  business_unit_nome VARCHAR(120) NOT NULL DEFAULT 'Corporativo',
  CONSTRAINT fk_produtos_business_unit FOREIGN KEY (business_unit_id) REFERENCES business_units(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ============================================
-- TABELAS: governanca
-- ============================================
DROP TABLE IF EXISTS user_project_access;
DROP TABLE IF EXISTS user_sessions;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(120) NOT NULL,
  email VARCHAR(200) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'viewer',
  resource_id INT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE user_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_sessions_user (user_id),
  CONSTRAINT fk_user_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE user_project_access (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  project_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_project_access (user_id, project_id),
  CONSTRAINT fk_user_project_access_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

INSERT INTO users (id, nome, email, password_hash, role, active) VALUES
(1, 'Administrador', 'admin@abc.local', 'abcadminseed2026:65b5afe4a56a002bd8d7470aa89dc310e32da5235858e942aece88b1e7373dba8c31150f6569937e1b24729c3d7eb0c200e8c23b28da5ed46cd58360a1be831f', 'admin', 1);

-- ============================================
-- TABELA: recursos
-- ============================================
DROP TABLE IF EXISTS recursos;
CREATE TABLE recursos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  external_id VARCHAR(50) DEFAULT '',
  nome VARCHAR(100) NOT NULL,
  funcao VARCHAR(100) DEFAULT '',
  seniority VARCHAR(50) DEFAULT '',
  specialties_json TEXT,
  resource_type VARCHAR(20) DEFAULT 'work',
  initials VARCHAR(20) DEFAULT '',
  max_units DECIMAL(6,2) DEFAULT 1,
  standard_rate DECIMAL(12,2) DEFAULT 0,
  overtime_rate DECIMAL(12,2) DEFAULT 0,
  email VARCHAR(200) DEFAULT ''
) ENGINE=InnoDB;

INSERT INTO recursos (nome, funcao) VALUES
('Almedson Ferreira', 'Gerente de Projeto'),
('André Alves', 'Java - Sênior'),
('André Guizelini', 'SAP - Analista Funcional'),
('Claudio Gonçalves', 'Gerente de Projeto'),
('Cleber Lopes', 'BI Analyst'),
('Cliente', 'TI'),
('David Cunha', 'Comercial'),
('Diego Brito', 'SAP - PI/PO'),
('Eduardo Cassiano', 'SAP - ABAP'),
('Eduardo Freitas', 'BI Analyst'),
('Eduardo Siqueira', 'Java - Pleno'),
('Ezequiel Lobo', 'Mobile - Júnior'),
('Flávio Costa', 'Java - Sênior'),
('Igor Cípola', 'Java - Pleno'),
('Israel Machado', 'Java - Pleno'),
('Julia Marinetto', ''),
('Key user-cliente', 'Java - Júnior'),
('Letson Galdino', ''),
('Lucas Ramos', ''),
('Maria Helena', 'Angular - Júnior'),
('Paulo Rogério', 'Gerente de Projeto'),
('Robson Oliveira', 'Infra');

-- ============================================
-- TABELA: projetos
-- ============================================
DROP TABLE IF EXISTS projetos;
CREATE TABLE projetos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_code VARCHAR(50) NOT NULL UNIQUE,
  project_type VARCHAR(30) NOT NULL DEFAULT 'Projeto',
  business_unit_id INT NOT NULL,
  business_unit_nome VARCHAR(120) NOT NULL DEFAULT 'Corporativo',
  produto_id INT NULL,
  produto_nome VARCHAR(160) NOT NULL DEFAULT '',
  projeto VARCHAR(100) NOT NULL,
  descricao VARCHAR(255) DEFAULT '',
  prioridade VARCHAR(50) DEFAULT '2- Média',
  responsavel VARCHAR(100) DEFAULT '',
  ftes DECIMAL(5,2) DEFAULT 0,
  valor_previsto DECIMAL(12,2) DEFAULT 0,
  valor_gasto DECIMAL(12,2) DEFAULT 0,
  data_inicio_planej VARCHAR(20) DEFAULT '',
  data_inicio_planej_date DATE NULL,
  data_fim_planej VARCHAR(20) DEFAULT '',
  data_fim_planej_date DATE NULL,
  data_inicio VARCHAR(20) DEFAULT '',
  data_inicio_real_date DATE NULL,
  data_fim_real VARCHAR(50) DEFAULT '',
  data_fim_real_date DATE NULL,
  total_tarefas INT DEFAULT 0,
  tarefas_concluidas INT DEFAULT 0,
  tarefas_andamento INT DEFAULT 0,
  tarefas_atrasadas INT DEFAULT 0,
  tarefas_nao_iniciadas INT DEFAULT 0,
  status VARCHAR(30) DEFAULT '',
  conclusao DECIMAL(5,2) DEFAULT 0,
  CONSTRAINT fk_projetos_business_unit FOREIGN KEY (business_unit_id) REFERENCES business_units(id) ON DELETE RESTRICT,
  CONSTRAINT fk_projetos_produto FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE SET NULL
) ENGINE=InnoDB;

INSERT INTO projetos (id, project_code, project_type, business_unit_id, business_unit_nome, produto_id, produto_nome, projeto, descricao, prioridade, responsavel, ftes, valor_previsto, valor_gasto, data_inicio_planej, data_fim_planej, data_inicio, data_fim_real, total_tarefas, tarefas_concluidas, tarefas_andamento, tarefas_atrasadas, tarefas_nao_iniciadas, status, conclusao) VALUES
(1, 'PRJ-HERING-BTG', 'Projeto', 1, 'Corporativo', NULL, '', 'Hering-BTG', 'HERING_eFCS Bank - Banco BTG Pactual', '2- Média', 'Claudio Gonçalves', 0.50, 200.00, 200.00, '', '', '12/3/25', 'Em andamento', 2, 0, 0, 2, 0, 'Atrasado', 0),
(2, 'PRJ-HERING-PORTAL', 'Projeto', 1, 'Corporativo', NULL, '', 'HERING - Portal', 'HERING - Portal de Fornecedores', '2- Média', 'Claudio Gonçalves', 3.00, 600.00, 600.00, '', '', '1/16/26', 'Em andamento', 6, 0, 0, 6, 0, 'Atrasado', 0),
(3, 'PRJ-JACTO-TAXES', 'Projeto', 1, 'Corporativo', NULL, '', 'Jacto - Taxes', 'JACTO_NovoCronograma_TAXES', '2- Média', 'Claudio Gonçalves', 2.00, 700.00, 700.00, '', '', '5/2/25', 'Em andamento', 12, 0, 3, 6, 3, 'Atrasado', 0),
(4, 'PRJ-MARCOPOLO-TAXES', 'Projeto', 1, 'Corporativo', NULL, '', 'Marcopolo - Taxes', 'MARCOPOLO_eFCS_TAXES', '2- Média', 'Claudio Gonçalves', 4.00, 8200.00, 8200.00, '', '', '12/3/25', 'Em andamento', 82, 0, 0, 13, 69, 'Atrasado', 0),
(5, 'PRJ-SGS-BMS', 'Projeto', 1, 'Corporativo', NULL, '', 'SGS - BMS', 'SGS - Timesheet BMS', '2- Média', 'David Cunha', 3.00, 1200.00, 1200.00, '', '', '1/14/26', 'Em andamento', 12, 0, 0, 12, 0, 'Atrasado', 0),
(6, 'PRJ-JARVIS-CTM', 'Projeto', 1, 'Corporativo', NULL, '', 'Jarvis - CTM', 'Produto Gestão de Serviços de Construção (CTM)', '2- Média', 'Flávio Costa', 4.00, 32362.48, 0.00, '', '', '4/15/25', 'Em andamento', 106, 0, 0, 106, 0, 'Atrasado', 0),
(7, 'PRJ-JARVIS-EDUCA', 'Projeto', 1, 'Corporativo', NULL, '', 'Jarvis - Educa', 'REESTRUTURAÇÃO DO PROJETO EDUCA BANCÁRIO', '2- Média', 'Flávio Costa', 1.00, 4404.38, 0.00, '', '', '7/22/25', 'Em andamento', 17, 0, 0, 17, 0, 'Atrasado', 0),
(8, 'PRJ-JARVIS-PCD', 'Projeto', 1, 'Corporativo', NULL, '', 'Jarvis - PCD', 'Projeto PCD', '2- Média', 'Flávio Costa', 3.00, 12231.52, 0.00, '', '', '6/9/25', 'Em andamento', 56, 0, 0, 56, 0, 'Atrasado', 0),
(9, 'PRJ-JARVIS-B3', 'Projeto', 1, 'Corporativo', NULL, '', 'Jarvis - B3', 'Projeto B3', '2- Média', 'Flávio Costa', 5.00, 7297.36, 0.00, '', '', '6/2/25', 'Em andamento', 20, 0, 0, 20, 0, 'Atrasado', 0),
(10, 'PRJ-NORMAN', 'Pré-Venda', 1, 'Corporativo', NULL, '', 'NORMAN', 'Automação de Reuniões com IA', '2- Média', 'Almedson Ferreira', 1.00, 0.00, 0.00, '', '', 'Não iniciado', '', 0, 0, 0, 0, 0, 'Concluído', 0);

-- ============================================
-- TABELA: tarefas
-- ============================================
DROP TABLE IF EXISTS tarefas;
CREATE TABLE tarefas (
  id VARCHAR(20) PRIMARY KEY,
  parent_id VARCHAR(20) DEFAULT NULL,
  external_id VARCHAR(50) DEFAULT '',
  wbs VARCHAR(50) DEFAULT '',
  outline_level INT DEFAULT 1,
  sort_order INT DEFAULT 0,
  projeto VARCHAR(100) NOT NULL,
  tarefa VARCHAR(255) DEFAULT '',
  subtarefa VARCHAR(255) DEFAULT '',
  responsavel VARCHAR(255) DEFAULT '',
  funcao VARCHAR(100) DEFAULT '',
  data_inicio_planej VARCHAR(20) DEFAULT '',
  data_inicio_planej_date DATE NULL,
  esforco_planej DECIMAL(8,2) DEFAULT 0,
  data_fim_planej VARCHAR(20) DEFAULT '',
  data_fim_planej_date DATE NULL,
  data_inicio_real VARCHAR(20) DEFAULT '',
  data_inicio_real_date DATE NULL,
  esforco_real DECIMAL(8,2) DEFAULT 0,
  data_fim_real VARCHAR(20) DEFAULT '',
  data_fim_real_date DATE NULL,
  percentual DECIMAL(5,2) DEFAULT 0,
  status VARCHAR(30) DEFAULT '',
  task_type VARCHAR(30) DEFAULT 'fixed_units',
  is_milestone TINYINT(1) DEFAULT 0,
  duration_minutes INT DEFAULT 0,
  is_manual TINYINT(1) DEFAULT 0,
  constraint_type VARCHAR(50) DEFAULT '',
  constraint_date VARCHAR(20) DEFAULT '',
  constraint_date_date DATE NULL,
  notes TEXT,
  valor_previsto DECIMAL(12,2) DEFAULT 0,
  valor_gasto DECIMAL(12,2) DEFAULT 0,
  dias_planejados INT DEFAULT 0,
  dias_real INT DEFAULT 0,
  dias_completados INT DEFAULT 0,
  INDEX idx_parent_id (parent_id),
  INDEX idx_projeto (projeto),
  INDEX idx_wbs (wbs),
  INDEX idx_tarefas_constraint_date_date (constraint_date_date)
) ENGINE=InnoDB;

DROP TABLE IF EXISTS task_assignments;
CREATE TABLE task_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  task_id VARCHAR(20) NOT NULL,
  resource_id INT NULL,
  resource_name VARCHAR(100) DEFAULT '',
  units DECIMAL(8,4) DEFAULT 1,
  work DECIMAL(10,2) DEFAULT 0,
  actual_work DECIMAL(10,2) DEFAULT 0,
  remaining_work DECIMAL(10,2) DEFAULT 0,
  cost DECIMAL(12,2) DEFAULT 0,
  INDEX idx_task_assignments_task (task_id),
  INDEX idx_task_assignments_resource (resource_id),
  UNIQUE KEY uq_task_resource_assignment (task_id, resource_id),
  CONSTRAINT fk_task_assignments_task FOREIGN KEY (task_id) REFERENCES tarefas(id) ON DELETE CASCADE,
  CONSTRAINT fk_task_assignments_resource FOREIGN KEY (resource_id) REFERENCES recursos(id) ON DELETE SET NULL
) ENGINE=InnoDB;

DROP TABLE IF EXISTS task_dependencies;
CREATE TABLE task_dependencies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  task_id VARCHAR(20) NOT NULL,
  predecessor_task_id VARCHAR(20) NOT NULL,
  dependency_type VARCHAR(10) DEFAULT 'FS',
  lag_minutes INT DEFAULT 0,
  INDEX idx_task_dependencies_task (task_id),
  INDEX idx_task_dependencies_predecessor (predecessor_task_id),
  CONSTRAINT fk_task_dependencies_task FOREIGN KEY (task_id) REFERENCES tarefas(id) ON DELETE CASCADE
) ENGINE=InnoDB;

DROP TABLE IF EXISTS comentarios;
CREATE TABLE comentarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  entity_type VARCHAR(20) NOT NULL,
  project_id INT NULL,
  project_name VARCHAR(100) DEFAULT '',
  task_id VARCHAR(20) NULL,
  task_name VARCHAR(255) DEFAULT '',
  author_user_id INT NULL,
  author_nome VARCHAR(120) DEFAULT '',
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_comentarios_project (project_id),
  INDEX idx_comentarios_task (task_id),
  INDEX idx_comentarios_author (author_user_id)
) ENGINE=InnoDB;

DROP TABLE IF EXISTS audit_logs;
CREATE TABLE audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(100) NOT NULL,
  action VARCHAR(20) NOT NULL,
  actor_user_id INT NULL,
  actor_nome VARCHAR(120) DEFAULT '',
  actor_role VARCHAR(20) DEFAULT '',
  project_id INT NULL,
  summary VARCHAR(500) DEFAULT '',
  before_json JSON NULL,
  after_json JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_logs_project (project_id),
  INDEX idx_audit_logs_entity (entity_type, entity_id),
  INDEX idx_audit_logs_actor (actor_user_id)
) ENGINE=InnoDB;

ALTER TABLE users
  ADD CONSTRAINT fk_users_resource FOREIGN KEY (resource_id) REFERENCES recursos(id) ON DELETE SET NULL;

ALTER TABLE user_project_access
  ADD CONSTRAINT fk_user_project_access_project FOREIGN KEY (project_id) REFERENCES projetos(id) ON DELETE CASCADE;

INSERT INTO tarefas (id, parent_id, projeto, tarefa, subtarefa, responsavel, funcao, data_inicio_planej, esforco_planej, data_fim_planej, data_inicio_real, esforco_real, data_fim_real, percentual, status, valor_previsto, valor_gasto, dias_planejados, dias_real, dias_completados) VALUES
('1.1', NULL, 'Hering-BTG', 'Encerramento - Subir para PRD', '', 'Cliente', 'TI', '12/3/25', 0.50, '12/3/25', '', 0, '', 0, 'Atrasado', 100.00, 100.00, 0, 0, 0),
('1.2', NULL, 'Hering-BTG', 'Termo de Aceite do Projeto', '', 'Claudio Gonçalves', 'Gerente de Projeto', '12/3/25', 0.50, '12/3/25', '', 0, '', 0, 'Atrasado', 100.00, 100.00, 0, 0, 0),
('2.1', NULL, 'HERING - Portal', 'Testes Integrados - Ajustes após testes', '', 'SAP FI;ABAP;JAVA-2', 'Infra', '11/4/25', 53.00, '1/16/26', '1/16/26', 53, '4/1/26', 40, 'Atrasado', 100.00, 100.00, 73, 75, 75),
('2.2', NULL, 'HERING - Portal', 'Testes Integrados', '', 'Cliente', 'Cliente Tester', '1/19/26', 5.00, '1/26/26', '', 0, '', 0, 'Atrasado', 100.00, 100.00, 7, 7, 0),
('2.3', NULL, 'HERING - Portal', 'Plano de Cutover', '', 'Claudio Gonçalves', 'Gerente de Projeto', '1/26/26', 0.50, '1/26/26', '', 0, '', 0, 'Atrasado', 100.00, 100.00, 0, 0, 0),
('2.4', NULL, 'HERING - Portal', 'Configuração PI para PRD', '', 'Diego Brito', 'SAP - PI/PO', '1/27/26', 0.50, '1/27/26', '', 0, '', 0, 'Atrasado', 100.00, 100.00, 0, 0, 0),
('2.5', NULL, 'HERING - Portal', 'Transporte Requests para PRD', '', 'Cliente', 'TI', '1/27/26', 0.25, '1/27/26', '', 0, '', 0, 'Atrasado', 100.00, 100.00, 0, 0, 0),
('2.6', NULL, 'HERING - Portal', 'Subida para PRD', '', 'André Alves', 'Java - Sênior', '1/27/26', 0.25, '1/27/26', '', 0, '', 0, 'Atrasado', 100.00, 100.00, 0, 0, 0),
('3.1', NULL, 'Jacto - Taxes', 'Reunião para realinhamento das funcionalidades', '', 'André Alves; André Guizelini; Igor Cípola; Key user-cliente', '', '5/2/25', 0.25, '5/2/25', '', 0, '', 0, 'Atrasado', 100.00, 100.00, 0, 0, 0),
('3.2', NULL, 'Jacto - Taxes', 'Testes integrados - eFCS', '', 'Igor Cípola', 'Java - Pleno', '1/7/26', 17.00, '1/30/26', '1/7/26', 17, '1/30/26', 10, 'Em andamento', 100.00, 100.00, 23, 23, 23),
('3.3', NULL, 'Jacto - Taxes', 'Testes integrados - SAP', '', 'André Guizelini', 'SAP - Analista Funcional', '1/7/26', 17.00, '1/30/26', '1/7/26', 17, '1/30/26', 10, 'Em andamento', 100.00, 100.00, 23, 23, 23),
('3.4', NULL, 'Jacto - Taxes', 'Testes integrados - Cliente', '', 'Cliente', 'Cliente Tester', '1/7/26', 17.00, '1/30/26', '1/7/26', 17, '1/30/26', 10, 'Em andamento', 100.00, 100.00, 23, 23, 23),
('3.5', NULL, 'Jacto - Taxes', 'Preparar para Cutover', '', 'Claudio Gonçalves', 'Gerente de Projeto', '1/30/26', 0.25, '1/30/26', '', 0, '', 0, 'Não iniciado', 100.00, 100.00, 0, 0, 0),
('3.6', NULL, 'Jacto - Taxes', 'Ajustes técnicos (Hardware, SO, Rede)', '', 'Igor Cípola;André Guizelini', 'Variadas', '1/30/26', 0.25, '1/30/26', '', 0, '', 0, 'Não iniciado', 100.00, 100.00, 0, 0, 0),
('3.7', NULL, 'Jacto - Taxes', 'Instalação em produção', '', 'Cliente', 'TI', '2/2/26', 0.50, '2/2/26', '', 0, '', 0, 'Não iniciado', 100.00, 100.00, 0, 0, 0),
('4.1', NULL, 'Marcopolo - Taxes', 'Atendimento as solicitações preliminares', '', 'Cliente', 'Gerente de Projeto', '11/28/25', 3.00, '12/3/25', '11/28/25', 3, '12/3/25', 10, 'Atrasado', 100.00, 100.00, 5, 5, 5),
('4.2', NULL, 'Marcopolo - Taxes', 'Reunião de entendimento - guias de antecipação', '', 'Claudio Gonçalves;GP-cliente;Igor Cípola;Key user-cliente', 'Variadas', '12/30/25', 0.25, '12/30/25', '', 0, '', 0, 'Atrasado', 100.00, 100.00, 0, 0, 0),
('4.3', NULL, 'Marcopolo - Taxes', 'Realização do Kickoff', '', 'Claudio Gonçalves;GP-cliente', 'Variadas', '1/19/26', 0.50, '1/19/26', '', 0, '', 50, 'Atrasado', 100.00, 100.00, 0, 0, 0),
('4.4', NULL, 'Marcopolo - Taxes', 'Assessment no ambiente SAP do cliente', '', 'André Guizelini', 'SAP - Analista Funcional', '1/20/26', 1.00, '1/21/26', '', 0, '', 0, 'Atrasado', 100.00, 100.00, 1, 1, 0),
('4.5', NULL, 'Marcopolo - Taxes', 'Definir novos processos de negócio - SAP', '', 'André Guizelini', 'SAP - Analista Funcional', '1/21/26', 1.00, '1/22/26', '', 0, '', 0, 'Atrasado', 100.00, 100.00, 1, 1, 0),
('4.6', NULL, 'Marcopolo - Taxes', 'Definir novos processos de negócio - EFCS', '', 'Igor Cípola', 'Java - Pleno', '1/19/26', 1.00, '1/20/26', '', 0, '', 0, 'Atrasado', 100.00, 100.00, 1, 1, 0),
('4.7', NULL, 'Marcopolo - Taxes', 'Business BluePrint - SAP', '', 'André Guizelini', 'SAP - Analista Funcional', '1/23/26', 1.00, '1/26/26', '', 0, '', 0, 'Atrasado', 100.00, 100.00, 3, 3, 0),
('4.8', NULL, 'Marcopolo - Taxes', 'Business BluePrint - EFCS', '', 'Igor Cípola', 'Java - Pleno', '1/20/26', 1.00, '1/21/26', '', 0, '', 0, 'Atrasado', 100.00, 100.00, 1, 1, 0),
('5.1', NULL, 'SGS - BMS', 'Fornecer acessos', '', 'Cliente', 'TI', '1/9/26', 3.00, '1/14/26', '', 0, '', 0, 'Atrasado', 100.00, 100.00, 5, 5, 0),
('5.2', NULL, 'SGS - BMS', 'Validar acessos', '', 'Igor Cípola', 'Java - Pleno', '1/14/26', 2.00, '1/16/26', '', 0, '', 0, 'Atrasado', 100.00, 100.00, 2, 2, 0),
('5.3', NULL, 'SGS - BMS', 'WebService de Envio ao ERP', '', 'Igor Cípola', 'Java - Pleno', '1/16/26', 4.00, '1/22/26', '', 0, '', 0, 'Atrasado', 100.00, 100.00, 6, 6, 0),
('6.1', NULL, 'Jarvis - CTM', 'Tela de Login', '', 'Ezequiel Lobo', 'Mobile - Júnior', '4/14/25', 1.00, '4/15/25', '', 0, '', 0, 'Atrasado', 140.48, 0.00, 1, 1, 0),
('6.2', NULL, 'Jarvis - CTM', 'Tela Controle de Efetivo', '', 'Ezequiel Lobo', 'Mobile - Júnior', '4/15/25', 1.50, '4/16/25', '', 0, '', 0, 'Atrasado', 210.72, 0.00, 1, 1, 0),
('6.3', NULL, 'Jarvis - CTM', 'Tela Controle de Medição', '', 'Ezequiel Lobo', 'Mobile - Júnior', '4/17/25', 1.50, '4/18/25', '', 0, '', 0, 'Atrasado', 210.72, 0.00, 1, 1, 0),
('7.1', NULL, 'Jarvis - Educa', 'Implementar service', '', 'Eduardo Freitas;Israel Machado;Julia Marinetto', 'Variadas', '7/22/25', 0.25, '7/22/25', '', 0, '', 95, 'Atrasado', 36.38, 0.00, 0, 0, 0),
('7.6', NULL, 'Jarvis - Educa', 'Incluir alunos após confirmação de pagamento', '', 'Flávio Costa', 'Java - Sênior', '7/30/25', 1.00, '7/31/25', '', 0, '', 0, 'Atrasado', 624.00, 0.00, 1, 1, 0),
('8.1', NULL, 'Jarvis - PCD', 'Levantamento do escopo/necessidades', '', 'Flávio Costa;Robson Oliveira', 'Variadas', '6/9/25', 0.50, '6/9/25', '', 0, '', 0, 'Atrasado', 373.80, 0.00, 0, 0, 0),
('8.2', NULL, 'Jarvis - PCD', 'Elaboração do Cronograma', '', 'Claudio Gonçalves', 'Gerente de Projeto', '6/9/25', 0.50, '6/9/25', '', 0, '', 0, 'Atrasado', 130.28, 0.00, 0, 0, 0),
('9.1', NULL, 'Jarvis - B3', 'Levantamento do escopo/necessidades', '', 'Flávio Costa;Robson Oliveira', 'Variadas', '6/2/25', 0.50, '6/2/25', '', 0, '', 0, 'Atrasado', 373.80, 0.00, 0, 0, 0),
('9.2', NULL, 'Jarvis - B3', 'Elaboração do Cronograma', '', 'Claudio Gonçalves', 'Gerente de Projeto', '6/2/25', 0.50, '6/2/25', '', 0, '', 0, 'Atrasado', 130.28, 0.00, 0, 0, 0);
