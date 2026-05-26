SET @sql = IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tarefas' AND COLUMN_NAME = 'projeto_id'),
  'SELECT 1',
  'ALTER TABLE tarefas ADD COLUMN projeto_id INT NULL AFTER projeto'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE tarefas t
INNER JOIN projetos p ON p.projeto = t.projeto
SET t.projeto_id = p.id
WHERE t.projeto_id IS NULL;

SET @sql = IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tarefas' AND INDEX_NAME = 'idx_tarefas_projeto_id'),
  'SELECT 1',
  'ALTER TABLE tarefas ADD INDEX idx_tarefas_projeto_id (projeto_id)'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
