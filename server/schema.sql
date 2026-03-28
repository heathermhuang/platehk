-- MySQL schema for server-side VRM search API

CREATE TABLE IF NOT EXISTS vrm_auction (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  dataset VARCHAR(32) NOT NULL,
  auction_date DATE NOT NULL,
  auction_date_label VARCHAR(64) DEFAULT NULL,
  session_label VARCHAR(16) DEFAULT NULL,
  is_lny TINYINT(1) NOT NULL DEFAULT 0,
  pdf_url VARCHAR(1024) DEFAULT NULL,
  total_sale_proceeds_hkd INT DEFAULT NULL,
  error_text VARCHAR(1024) DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_dataset_date (dataset, auction_date),
  KEY idx_dataset_date (dataset, auction_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS vrm_result (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  dataset VARCHAR(32) NOT NULL,
  auction_date DATE NOT NULL,
  single_line VARCHAR(32) NOT NULL,
  double_top VARCHAR(32) DEFAULT NULL,
  double_bottom VARCHAR(32) DEFAULT NULL,
  amount_hkd INT DEFAULT NULL,
  pdf_url VARCHAR(1024) DEFAULT NULL,
  -- Hash of pdf_url for uniqueness without exceeding InnoDB index key limits under utf8mb4.
  pdf_url_hash BINARY(20) DEFAULT NULL,
  -- Search keys (normalized). Keep display fields untouched.
  single_norm VARCHAR(32) NOT NULL,
  double_norm VARCHAR(32) DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_row (dataset, auction_date, single_line, amount_hkd, pdf_url_hash),
  KEY idx_dataset_date_amount (dataset, auction_date, amount_hkd),
  KEY idx_dataset_single_norm (dataset, single_norm),
  KEY idx_dataset_double_norm (dataset, double_norm)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Optional: store sync state or other small key-values.
CREATE TABLE IF NOT EXISTS vrm_kv (
  k VARCHAR(64) NOT NULL,
  v TEXT,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (k)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
