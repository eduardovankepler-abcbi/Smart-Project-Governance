SET @sql = IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tarefas' AND COLUMN_NAME = 'constraint_date_date'),
  'SELECT 1',
  "ALTER TABLE tarefas ADD COLUMN constraint_date_date DATE NULL"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE tarefas
SET constraint_date_date = CASE
  WHEN constraint_date REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN STR_TO_DATE(constraint_date, '%Y-%m-%d')
  WHEN constraint_date REGEXP '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4}$' THEN STR_TO_DATE(constraint_date, '%c/%e/%y')
  ELSE NULL
END
WHERE constraint_date_date IS NULL
  AND constraint_date IS NOT NULL
  AND constraint_date <> '';

SET @sql = IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tarefas' AND INDEX_NAME = 'idx_tarefas_constraint_date_date'),
  'SELECT 1',
  "ALTER TABLE tarefas ADD INDEX idx_tarefas_constraint_date_date (constraint_date_date)"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
