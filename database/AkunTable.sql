-- Table: akun
-- Description: Menyimpan data akun pengguna untuk autentikasi dan otorisasi modul.
-- Standard: Mengikut aturan DatabaseRule.md dan StorageRule.md (untuk foto profil) dengan pola Shadow Table Migration

PRAGMA foreign_keys = OFF;

-- 1. [PENTING] Handler Baseline
CREATE TABLE IF NOT EXISTS akun (
    id TEXT PRIMARY KEY,
    kode_akses TEXT UNIQUE,
    password TEXT,
    username TEXT,
    foto_profil TEXT,
    telepon TEXT,
    jabatan TEXT,
    peran TEXT,
    akses_modul TEXT,
    has_invoice_approval INTEGER,
    is_active INTEGER,
    created_at DATETIME,
    created_by TEXT,
    created_timezone TEXT,
    updated_at DATETIME,
    updated_by TEXT,
    updated_timezone TEXT
);

CREATE TABLE IF NOT EXISTS akun_new (
    id TEXT PRIMARY KEY DEFAULT (
        lower(hex(randomblob(4))) || '-' || 
        lower(hex(randomblob(2))) || '-4' || 
        substr(lower(hex(randomblob(2))), 2) || '-' || 
        substr('89ab', abs(random()) % 4 + 1, 1) || 
        substr(lower(hex(randomblob(2))), 2) || '-' || 
        lower(hex(randomblob(6)))
    ),
    
    kode_akses TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    username TEXT NOT NULL,
    foto_profil TEXT,
    telepon TEXT,
    
    jabatan TEXT NOT NULL,
    peran TEXT NOT NULL CHECK(peran IN ('User', 'Admin', 'Guest')),
    akses_modul TEXT NOT NULL,
    has_invoice_approval INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    is_deleted INTEGER DEFAULT 0,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT,
    created_timezone TEXT DEFAULT 'Asia/Jakarta',
    
    updated_at DATETIME,
    updated_by TEXT,
    updated_timezone TEXT DEFAULT 'Asia/Jakarta'
);

INSERT INTO akun_new (
    id, kode_akses, password, username, foto_profil, telepon,
    jabatan, peran, akses_modul, has_invoice_approval, is_active,
    created_at, created_by, created_timezone, updated_at, updated_by, updated_timezone
)
SELECT 
    id, kode_akses, password, username, foto_profil, telepon,
    jabatan, peran, akses_modul, has_invoice_approval, is_active,
    created_at, created_by, created_timezone, updated_at, updated_by, updated_timezone
FROM akun 
WHERE id IS NOT NULL;

DROP TABLE IF EXISTS akun;

ALTER TABLE akun_new RENAME TO akun;

CREATE INDEX IF NOT EXISTS idx_akun_kode_akses ON akun(kode_akses);

CREATE TRIGGER IF NOT EXISTS akun_update_audit
AFTER UPDATE ON akun
FOR EACH ROW
BEGIN
  UPDATE akun 
  SET updated_at = CURRENT_TIMESTAMP 
  WHERE id = OLD.id;
END;

PRAGMA foreign_keys = ON;
