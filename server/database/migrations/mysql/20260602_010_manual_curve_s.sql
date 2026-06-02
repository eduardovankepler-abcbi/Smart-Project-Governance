CREATE TABLE IF NOT EXISTS project_curve_s_series (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL,
  series_type ENUM('baseline', 'actual') NOT NULL DEFAULT 'baseline',
  baseline_number INT NOT NULL DEFAULT 0,
  series_name VARCHAR(120) NOT NULL,
  status ENUM('draft', 'pending_approval', 'approved', 'rejected') NOT NULL DEFAULT 'draft',
  is_official TINYINT(1) NOT NULL DEFAULT 0,
  justification TEXT NULL,
  approval_notes TEXT NULL,
  created_by_user_id INT NULL,
  created_by_name VARCHAR(120) NULL,
  created_by_role VARCHAR(20) NULL,
  approved_by_user_id INT NULL,
  approved_by_name VARCHAR(120) NULL,
  approved_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_curve_s_project_series (project_id, series_type, baseline_number),
  INDEX idx_curve_s_series_project (project_id),
  INDEX idx_curve_s_series_status (status),
  CONSTRAINT fk_curve_s_series_project FOREIGN KEY (project_id) REFERENCES projetos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_curve_s_points (
  id INT AUTO_INCREMENT PRIMARY KEY,
  series_id INT NOT NULL,
  project_id INT NOT NULL,
  curve_date DATE NOT NULL,
  percent_value DECIMAL(5,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_curve_s_point (series_id, curve_date),
  INDEX idx_curve_s_points_project_date (project_id, curve_date),
  CONSTRAINT fk_curve_s_points_series FOREIGN KEY (series_id) REFERENCES project_curve_s_series(id) ON DELETE CASCADE,
  CONSTRAINT fk_curve_s_points_project FOREIGN KEY (project_id) REFERENCES projetos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_curve_s_observations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL,
  curve_date DATE NOT NULL,
  observation VARCHAR(255) NOT NULL DEFAULT '',
  created_by_user_id INT NULL,
  created_by_name VARCHAR(120) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_curve_s_observation (project_id, curve_date),
  INDEX idx_curve_s_observations_project (project_id),
  CONSTRAINT fk_curve_s_observations_project FOREIGN KEY (project_id) REFERENCES projetos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
