CREATE TABLE IF NOT EXISTS receipts (
  id TEXT PRIMARY KEY,
  so_phieu TEXT NOT NULL,
  ngay TEXT,
  so_xe TEXT,
  tai_xe TEXT,
  sdt TEXT,
  cuoc_xe REAL,
  tong_hang REAL,
  tong_gom_cuoc REAL,
  created_at TEXT,
  full_json TEXT,
  device_id TEXT,
  app_version TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS receipt_items (
  id TEXT PRIMARY KEY,
  receipt_id TEXT NOT NULL,
  chu_hang TEXT,
  loai_hang TEXT,
  loai_bao TEXT,
  so_bao REAL,
  trong_luong_kg REAL,
  tap_chat REAL,
  don_gia REAL,
  thanh_tien REAL
);
