# Panduan Migrasi: Implementasi Soft Delete (Supabase / PostgreSQL)

## Latar Belakang
Pada arsitektur relational database, melakukan *hard delete* (penghapusan data secara fisik dengan perintah `DELETE`) pada data master (seperti Akun, Customer, Suplier) seringkali memicu error `FOREIGN KEY constraint failed`. Hal ini terjadi jika data master tersebut sudah digunakan (direferensikan) dalam tabel transaksi (misalnya Penjualan, Pembelian), sehingga database mencegah penghapusan untuk menjaga integritas data (Referential Integrity).

## Solusi: Soft Delete
Untuk mengatasi kendala tersebut tanpa menghilangkan rekam jejak historis laporan, kita menerapkan metode **Soft Delete**.
Soft Delete berarti kita tidak benar-benar menghapus data dari database, melainkan hanya menandai data tersebut sebagai "dihapus" dengan menambahkan kolom flag status (misal `is_deleted`). Data yang ditandai ini kemudian disembunyikan dari tampilan antarmuka pengguna (UI) melalui filter pada layer query/service.

Dokumen ini berisi panduan teknis untuk mereplikasi perubahan *Soft Delete* yang telah dilakukan di versi SQLite (Turso) agar dapat diimplementasikan ke aplikasi identik yang menggunakan **Supabase (PostgreSQL)**.

---

## 1. Perubahan Skema Database (Supabase SQL Editor)
Pada PostgreSQL (Supabase), disarankan menggunakan tipe data `BOOLEAN` untuk flag status. 

Jalankan perintah DDL berikut pada Supabase SQL Editor untuk menambahkan kolom `is_deleted` pada tabel target:

```sql
-- Tambahkan kolom is_deleted dengan nilai default false
ALTER TABLE customer ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE suplier ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE akun ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;

-- (Opsional) Tambahkan Index untuk mempercepat query pencarian dengan filter is_deleted
CREATE INDEX IF NOT EXISTS idx_customer_is_deleted ON customer(is_deleted);
CREATE INDEX IF NOT EXISTS idx_suplier_is_deleted ON suplier(is_deleted);
CREATE INDEX IF NOT EXISTS idx_akun_is_deleted ON akun(is_deleted);
```

---

## 2. Perubahan Logika di Service Layer (Frontend/Backend)

Karena aplikasi Anda menggunakan Supabase, kueri database kemungkinan dilakukan menggunakan Supabase JS Client (`@supabase/supabase-js`). Anda wajib mengubah fungsi *Delete* dan *Retrieve* di dalam file service masing-masing (`customerService.ts`, `suplierService.ts`, `akunService.ts`).

### A. Perubahan Fungsi `delete` (Mengubah dari Delete ke Update)

Mengubah logika penghapusan fisik menjadi *update* status flag.

**Sebelum (Hard Delete):**
```typescript
async delete(id: string) {
  const { error } = await supabase
    .from('customer')
    .delete()
    .eq('id', id);
  if (error) throw error;
  return true;
}
```

**Sesudah (Soft Delete):**
```typescript
async delete(id: string) {
  const { error } = await supabase
    .from('customer')
    .update({ is_deleted: true }) // Update flag saja
    .eq('id', id);
  if (error) throw error;
  return true;
}
```

*Aturan di file Akun juga disamakan untuk fungsi `deleteMany` (bila menggunakan `.in('id', ids)`).*

### B. Perubahan Fungsi Pengambilan Data (`getAll`, `getPaginated`, dll)

Semua fungsi yang mengambil *list* atau pengecekan *existences* harus diselipkan filter agar mengabaikan data yang sudah ditandai terhapus.

**Contoh pada `getAll`:**
```typescript
async getAll() {
  const { data, error } = await supabase
    .from('customer')
    .select('*')
    .is('is_deleted', false) // Filter tambahan utama
    .order('name', { ascending: true });
    
  if (error) throw error;
  return data;
}
```

**Filter Pagination/Pencarian Kompleks (`getPaginated`):**
Pastikan filter pencarian di rantai *query builder* Supabase juga diakhiri dengan proteksi data aktif.

```typescript
// Konstruksi awal query
let query = supabase
    .from('suplier')
    .select('*', { count: 'exact' })
    .is('is_deleted', false); // Memastikan yang ditarik hanya data aktif

if (search) {
    query = query.or(`name.ilike.%${search}%, email.ilike.%${search}%`);
}

// Lanjutkan dengan pagination & pemanggilan execute...
```

**Pengecekan Unik (Contoh Pengecekan Username/Kode Akses):**
Data yang di-*soft delete* tidak boleh menghalangi user baru untuk membuat kode/username yang sama. Pastikan pengecekan hanya mencari pada record yang belum dihapus.

```typescript
async isUsernameTaken(username: string) {
  const { count, error } = await supabase
    .from('akun')
    .select('*', { head: true, count: 'exact' })
    .eq('username', username)
    .is('is_deleted', false); // Abaikan histori yang terhapus
    
  if (error) throw error;
  return (count || 0) > 0;
}
```

---

## 3. Catatan Implementasi & Keamanan Akses
*   **Unique Constraint Conflict:** Jika ada kolom unik (misal: `kode_akses` pada tabel `akun`), Supabase akan melempar error duplikat bila Anda mendaftarkan kode yang sama dengan data yang sudah di-*soft delete*.
    *   *Solusi Supabase:* Gunakan _Partial Unique Index_ di PostgreSQL agar *constraint* `UNIQUE` hanya berlaku pada baris yang aktif.
    ```sql
    -- Hapus constraint unique lama (harus diketahui nama constraintnya)
    ALTER TABLE akun DROP CONSTRAINT akun_kode_akses_key; 
    
    -- Buat Partial Unique Index
    CREATE UNIQUE INDEX akun_kode_akses_unique_active 
    ON akun (kode_akses) 
    WHERE is_deleted = FALSE OR is_deleted IS NULL;
    ```
*   **Foreign Key Aman:** Data transaksi lama akan tetap memunculkan nama customer atau suplier lama berdasarkan ID relasinya (karena datanya masih utuh di database).
*   **Clean Up Opsional:** Bila suatu saat diperlukan pembersihan data riil, hal ini bisa dilakukan terpisah di sisi backend (CRON job) untuk menghapus data yang `is_deleted = TRUE` dan tidak punya tanggungan relasi, namun umumnya dibiarkan selamanya sebagai histori.
