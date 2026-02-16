CREATE TABLE IF NOT EXISTS schema_cache (
    id INT AUTO_INCREMENT PRIMARY KEY,
    empresa_id VARCHAR(50) NOT NULL UNIQUE,
    schema_data JSON NOT NULL,
    tabla_principal VARCHAR(100),
    total_columnas INT,
    total_registros BIGINT,
    database_name VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    discovery_duration_ms INT,
    INDEX idx_empresa (empresa_id),
    INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ml_predictions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    empresa_id VARCHAR(50) NOT NULL,
    prediction_type VARCHAR(50) NOT NULL,
    input_params JSON,
    prediction_result JSON,
    confidence_score DECIMAL(5,4),
    model_used VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_empresa_type (empresa_id, prediction_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
