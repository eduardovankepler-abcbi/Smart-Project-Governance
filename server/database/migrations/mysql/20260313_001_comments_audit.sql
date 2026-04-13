CREATE TABLE IF NOT EXISTS comentarios (
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
);

CREATE TABLE IF NOT EXISTS audit_logs (
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
);

CREATE TABLE IF NOT EXISTS task_assignments (
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
  INDEX idx_task_assignments_resource (resource_id)
) ENGINE=InnoDB;

SET @sql = IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'task_assignments' AND COLUMN_NAME = 'resource_id'),
  'SELECT 1',
  "ALTER TABLE task_assignments ADD COLUMN resource_id INT NULL AFTER task_id"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'task_assignments' AND COLUMN_NAME = 'resource_name'),
  'SELECT 1',
  "ALTER TABLE task_assignments ADD COLUMN resource_name VARCHAR(100) DEFAULT '' AFTER resource_id"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'task_assignments' AND COLUMN_NAME = 'units'),
  'SELECT 1',
  "ALTER TABLE task_assignments ADD COLUMN units DECIMAL(8,4) DEFAULT 1 AFTER resource_name"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'task_assignments' AND COLUMN_NAME = 'work'),
  'SELECT 1',
  "ALTER TABLE task_assignments ADD COLUMN work DECIMAL(10,2) DEFAULT 0 AFTER units"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'task_assignments' AND COLUMN_NAME = 'actual_work'),
  'SELECT 1',
  "ALTER TABLE task_assignments ADD COLUMN actual_work DECIMAL(10,2) DEFAULT 0 AFTER work"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'task_assignments' AND COLUMN_NAME = 'remaining_work'),
  'SELECT 1',
  "ALTER TABLE task_assignments ADD COLUMN remaining_work DECIMAL(10,2) DEFAULT 0 AFTER actual_work"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'task_assignments' AND COLUMN_NAME = 'cost'),
  'SELECT 1',
  "ALTER TABLE task_assignments ADD COLUMN cost DECIMAL(12,2) DEFAULT 0 AFTER remaining_work"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

DELETE ta1
FROM task_assignments ta1
INNER JOIN task_assignments ta2
  ON ta1.task_id = ta2.task_id
 AND ta1.resource_id = ta2.resource_id
 AND ta1.id > ta2.id
WHERE ta1.resource_id IS NOT NULL;

SET @sql = IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'task_assignments' AND INDEX_NAME = 'uq_task_resource_assignment'),
  'SELECT 1',
  "ALTER TABLE task_assignments ADD CONSTRAINT uq_task_resource_assignment UNIQUE (task_id, resource_id)"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
