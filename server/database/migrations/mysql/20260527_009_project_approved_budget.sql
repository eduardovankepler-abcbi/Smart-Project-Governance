SET @sql = IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projetos' AND COLUMN_NAME = 'orcamento_aprovado'),
  'SELECT 1',
  'ALTER TABLE projetos ADD COLUMN orcamento_aprovado DECIMAL(12,2) DEFAULT 0 AFTER valor_previsto'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE projetos
   SET orcamento_aprovado = valor_previsto
 WHERE COALESCE(orcamento_aprovado, 0) = 0
   AND COALESCE(valor_previsto, 0) > 0;
