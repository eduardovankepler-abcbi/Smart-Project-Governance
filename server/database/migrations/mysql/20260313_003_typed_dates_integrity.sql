SET @sql = IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projetos' AND COLUMN_NAME = 'data_inicio_planej_date'),
  'SELECT 1',
  'ALTER TABLE projetos ADD COLUMN data_inicio_planej_date DATE NULL'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projetos' AND COLUMN_NAME = 'data_fim_planej_date'),
  'SELECT 1',
  'ALTER TABLE projetos ADD COLUMN data_fim_planej_date DATE NULL'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projetos' AND COLUMN_NAME = 'data_inicio_real_date'),
  'SELECT 1',
  'ALTER TABLE projetos ADD COLUMN data_inicio_real_date DATE NULL'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projetos' AND COLUMN_NAME = 'data_fim_real_date'),
  'SELECT 1',
  'ALTER TABLE projetos ADD COLUMN data_fim_real_date DATE NULL'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tarefas' AND COLUMN_NAME = 'data_inicio_planej_date'),
  'SELECT 1',
  'ALTER TABLE tarefas ADD COLUMN data_inicio_planej_date DATE NULL'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tarefas' AND COLUMN_NAME = 'data_fim_planej_date'),
  'SELECT 1',
  'ALTER TABLE tarefas ADD COLUMN data_fim_planej_date DATE NULL'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tarefas' AND COLUMN_NAME = 'data_inicio_real_date'),
  'SELECT 1',
  'ALTER TABLE tarefas ADD COLUMN data_inicio_real_date DATE NULL'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tarefas' AND COLUMN_NAME = 'data_fim_real_date'),
  'SELECT 1',
  'ALTER TABLE tarefas ADD COLUMN data_fim_real_date DATE NULL'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE projetos
SET
  data_inicio_planej_date = CASE
    WHEN data_inicio_planej REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN STR_TO_DATE(data_inicio_planej, '%Y-%m-%d')
    WHEN data_inicio_planej REGEXP '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4}$' THEN STR_TO_DATE(data_inicio_planej, '%c/%e/%y')
    ELSE NULL
  END,
  data_fim_planej_date = CASE
    WHEN data_fim_planej REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN STR_TO_DATE(data_fim_planej, '%Y-%m-%d')
    WHEN data_fim_planej REGEXP '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4}$' THEN STR_TO_DATE(data_fim_planej, '%c/%e/%y')
    ELSE NULL
  END,
  data_inicio_real_date = CASE
    WHEN data_inicio REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN STR_TO_DATE(data_inicio, '%Y-%m-%d')
    WHEN data_inicio REGEXP '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4}$' THEN STR_TO_DATE(data_inicio, '%c/%e/%y')
    ELSE NULL
  END,
  data_fim_real_date = CASE
    WHEN data_fim_real REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN STR_TO_DATE(data_fim_real, '%Y-%m-%d')
    WHEN data_fim_real REGEXP '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4}$' THEN STR_TO_DATE(data_fim_real, '%c/%e/%y')
    ELSE NULL
  END;

UPDATE tarefas
SET
  data_inicio_planej_date = CASE
    WHEN data_inicio_planej REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN STR_TO_DATE(data_inicio_planej, '%Y-%m-%d')
    WHEN data_inicio_planej REGEXP '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4}$' THEN STR_TO_DATE(data_inicio_planej, '%c/%e/%y')
    ELSE NULL
  END,
  data_fim_planej_date = CASE
    WHEN data_fim_planej REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN STR_TO_DATE(data_fim_planej, '%Y-%m-%d')
    WHEN data_fim_planej REGEXP '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4}$' THEN STR_TO_DATE(data_fim_planej, '%c/%e/%y')
    ELSE NULL
  END,
  data_inicio_real_date = CASE
    WHEN data_inicio_real REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN STR_TO_DATE(data_inicio_real, '%Y-%m-%d')
    WHEN data_inicio_real REGEXP '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4}$' THEN STR_TO_DATE(data_inicio_real, '%c/%e/%y')
    ELSE NULL
  END,
  data_fim_real_date = CASE
    WHEN data_fim_real REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN STR_TO_DATE(data_fim_real, '%Y-%m-%d')
    WHEN data_fim_real REGEXP '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4}$' THEN STR_TO_DATE(data_fim_real, '%c/%e/%y')
    ELSE NULL
  END;

UPDATE produtos p
LEFT JOIN business_units bu ON bu.id = p.business_unit_id
SET p.business_unit_id = 1, p.business_unit_nome = 'Corporativo'
WHERE bu.id IS NULL;

UPDATE projetos pr
LEFT JOIN business_units bu ON bu.id = pr.business_unit_id
SET pr.business_unit_id = 1, pr.business_unit_nome = 'Corporativo'
WHERE bu.id IS NULL;

UPDATE projetos pr
LEFT JOIN produtos pd ON pd.id = pr.produto_id
SET pr.produto_id = NULL, pr.produto_nome = ''
WHERE pr.produto_id IS NOT NULL AND pd.id IS NULL;

UPDATE users u
LEFT JOIN recursos r ON r.id = u.resource_id
SET u.resource_id = NULL
WHERE u.resource_id IS NOT NULL AND r.id IS NULL;

DELETE upa
FROM user_project_access upa
LEFT JOIN projetos p ON p.id = upa.project_id
WHERE p.id IS NULL;

SET @sql = IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projetos' AND INDEX_NAME = 'idx_projetos_data_inicio_planej_date'),
  'SELECT 1',
  'ALTER TABLE projetos ADD INDEX idx_projetos_data_inicio_planej_date (data_inicio_planej_date)'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projetos' AND INDEX_NAME = 'idx_projetos_data_fim_planej_date'),
  'SELECT 1',
  'ALTER TABLE projetos ADD INDEX idx_projetos_data_fim_planej_date (data_fim_planej_date)'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tarefas' AND INDEX_NAME = 'idx_tarefas_data_inicio_planej_date'),
  'SELECT 1',
  'ALTER TABLE tarefas ADD INDEX idx_tarefas_data_inicio_planej_date (data_inicio_planej_date)'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tarefas' AND INDEX_NAME = 'idx_tarefas_data_fim_planej_date'),
  'SELECT 1',
  'ALTER TABLE tarefas ADD INDEX idx_tarefas_data_fim_planej_date (data_fim_planej_date)'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_produtos_business_unit'),
  'SELECT 1',
  'ALTER TABLE produtos ADD CONSTRAINT fk_produtos_business_unit FOREIGN KEY (business_unit_id) REFERENCES business_units(id) ON DELETE RESTRICT'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_projetos_business_unit'),
  'SELECT 1',
  'ALTER TABLE projetos ADD CONSTRAINT fk_projetos_business_unit FOREIGN KEY (business_unit_id) REFERENCES business_units(id) ON DELETE RESTRICT'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_projetos_produto'),
  'SELECT 1',
  'ALTER TABLE projetos ADD CONSTRAINT fk_projetos_produto FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE SET NULL'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_users_resource'),
  'SELECT 1',
  'ALTER TABLE users ADD CONSTRAINT fk_users_resource FOREIGN KEY (resource_id) REFERENCES recursos(id) ON DELETE SET NULL'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_user_project_access_project'),
  'SELECT 1',
  'ALTER TABLE user_project_access ADD CONSTRAINT fk_user_project_access_project FOREIGN KEY (project_id) REFERENCES projetos(id) ON DELETE CASCADE'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
