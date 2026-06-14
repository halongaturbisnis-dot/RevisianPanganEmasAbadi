-- Table: suplier
-- Description: Menyimpan data suplier untuk modul Pengadaan.
-- Standard: Mengikuti aturan DatabaseRule.md dengan pola Shadow Table Migration

PRAGMA foreign_keys = OFF;

-- 1. [PENTING] Handler Baseline: Pastikan tabel target ada dengan struktur kolom dasar
CREATE TABLE IF NOT EXISTS suplier (
    id TEXT PRIMARY KEY,
    name TEXT,
    telepon TEXT,
    email TEXT,
    latlong TEXT,
    alamat TEXT,
    bank_name TEXT,
    no_rekening TEXT,
    nama_pemilik_rekening TEXT,
    created_at DATETIME,
    created_by TEXT,
    created_timezone TEXT,
    updated_at DATETIME,
    updated_by TEXT,
    updated_timezone TEXT
);

-- 2. Buat tabel bayangan dengan skema FINAL/Paling Update
CREATE TABLE IF NOT EXISTS suplier_new (
    id TEXT PRIMARY KEY DEFAULT (
        lower(hex(randomblob(4))) || '-' || 
        lower(hex(randomblob(2))) || '-4' || 
        substr(lower(hex(randomblob(2))), 2) || '-' || 
        substr('89ab', abs(random()) % 4 + 1, 1) || 
        substr(lower(hex(randomblob(2))), 2) || '-' || 
        lower(hex(randomblob(6)))
    ),
    
    -- Data Suplier
    name TEXT NOT NULL,
    telepon TEXT NOT NULL,
    email TEXT,
    latlong TEXT NOT NULL,                -- Format: "latitude,longitude"
    alamat TEXT NOT NULL,                
    bank_name TEXT,
    no_rekening TEXT,
    nama_pemilik_rekening TEXT,                
    is_deleted INTEGER DEFAULT 0,
    
    -- Audit Trail
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT,
    created_timezone TEXT DEFAULT 'Asia/Jakarta',
    
    updated_at DATETIME,
    updated_by TEXT,
    updated_timezone TEXT DEFAULT 'Asia/Jakarta'
);

-- 3. Kloning data dari tabel existing ke tabel baru
-- Menggunakan kolom eksplisit
INSERT INTO suplier_new (
    id, name, telepon, email, latlong, alamat, 
    bank_name, no_rekening, nama_pemilik_rekening,
    created_at, created_by, created_timezone, 
    updated_at, updated_by, updated_timezone
)
SELECT 
    id, name, telepon, email, latlong, alamat, 
    bank_name, no_rekening, nama_pemilik_rekening,
    created_at, created_by, created_timezone, 
    updated_at, updated_by, updated_timezone
FROM suplier 
WHERE id IS NOT NULL;

-- 4. Hapus tabel lama
DROP TABLE IF EXISTS suplier;

-- 5. Ubah nama tabel bayangan menjadi nama tabel utama
ALTER TABLE suplier_new RENAME TO suplier;

-- 6. Buat Index
CREATE INDEX IF NOT EXISTS idx_suplier_name ON suplier(name);

-- 7. Daftarkan ulang trigger audit trail
CREATE TRIGGER IF NOT EXISTS suplier_update_audit
AFTER UPDATE ON suplier
FOR EACH ROW
BEGIN
  UPDATE suplier SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;

PRAGMA foreign_keys = ON;
