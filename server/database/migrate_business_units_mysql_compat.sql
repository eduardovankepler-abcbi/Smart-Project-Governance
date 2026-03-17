CREATE TABLE IF NOT EXISTS business_units (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(120) NOT NULL UNIQUE,
  head VARCHAR(120) DEFAULT '',
  lider_tec VARCHAR(120) DEFAULT '',
  lider_op VARCHAR(120) DEFAULT '',
  comercial VARCHAR(120) DEFAULT ''
);

INSERT IGNORE INTO business_units (id, nome, head, lider_tec, lider_op, comercial)
VALUES (1, 'Corporativo', 'Claudio Gonçalves', 'Flávio Costa', 'Almedson Ferreira', 'David Cunha');

SET @sql = IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projetos' AND COLUMN_NAME = 'business_unit_id'),
  'SELECT 1',
  "ALTER TABLE projetos ADD COLUMN business_unit_id INT NOT NULL DEFAULT 1"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projetos' AND COLUMN_NAME = 'business_unit_nome'),
  'SELECT 1',
  "ALTER TABLE projetos ADD COLUMN business_unit_nome VARCHAR(120) NOT NULL DEFAULT 'Corporativo'"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE projetos
SET business_unit_id = 1
WHERE business_unit_id IS NULL OR business_unit_id = 0;

UPDATE projetos
SET business_unit_nome = 'Corporativo'
WHERE business_unit_nome IS NULL OR business_unit_nome = '';
