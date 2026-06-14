-- Table: customer
-- Description: Menyimpan data pembeli/pelanggan untuk modul Customer.
-- Standard: Mengikuti aturan DatabaseRule.md dengan pola Shadow Table Migration

PRAGMA foreign_keys = OFF;

-- 1. [PENTING] Handler Baseline
CREATE TABLE IF NOT EXISTS customer (
    id TEXT PRIMARY KEY,
    name TEXT,
    company TEXT,
    telepon TEXT,
    email TEXT,
    latlong TEXT,
    alamat TEXT,
    bidang_usaha TEXT,
    created_at DATETIME,
    created_by TEXT,
    created_timezone TEXT,
    updated_at DATETIME,
    updated_by TEXT,
    updated_timezone TEXT
);

-- 2. Buat tabel bayangan
CREATE TABLE IF NOT EXISTS customer_new (
    id TEXT PRIMARY KEY DEFAULT (
        lower(hex(randomblob(4))) || '-' || 
        lower(hex(randomblob(2))) || '-4' || 
        substr(lower(hex(randomblob(2))), 2) || '-' || 
        substr('89ab', abs(random()) % 4 + 1, 1) || 
        substr(lower(hex(randomblob(2))), 2) || '-' || 
        lower(hex(randomblob(6)))
    ),
    
    -- Data Customer
    name TEXT NOT NULL,
    company TEXT,
    telepon TEXT NOT NULL,
    email TEXT,
    latlong TEXT NOT NULL,
    alamat TEXT NOT NULL,
    bidang_usaha TEXT,
    is_deleted INTEGER DEFAULT 0,
    
    -- Audit Trail (Mandatory sesuai DatabaseRule.md)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT,
    created_timezone TEXT DEFAULT 'Asia/Jakarta',
    
    updated_at DATETIME,
    updated_by TEXT,
    updated_timezone TEXT DEFAULT 'Asia/Jakarta'
);

-- 3. Kloning data
INSERT INTO customer_new (
    id, name, company, telepon, email, latlong, alamat, bidang_usaha, 
    created_at, created_by, created_timezone, updated_at, updated_by, updated_timezone
)
SELECT 
    id, name, company, telepon, email, latlong, alamat, bidang_usaha, 
    created_at, created_by, created_timezone, updated_at, updated_by, updated_timezone
FROM customer 
WHERE id IS NOT NULL;

-- 4. Hapus tabel lama
DROP TABLE IF EXISTS customer;

-- 5. Ubah tabel bayangan menjadi tabel utama
ALTER TABLE customer_new RENAME TO customer;

-- 6. Index
CREATE INDEX IF NOT EXISTS idx_customer_name ON customer(name);

-- 7. Trigger
CREATE TRIGGER IF NOT EXISTS customer_update_audit
AFTER UPDATE ON customer
FOR EACH ROW
BEGIN
  UPDATE customer 
  SET updated_at = CURRENT_TIMESTAMP 
  WHERE id = OLD.id;
END;

PRAGMA foreign_keys = ON;
