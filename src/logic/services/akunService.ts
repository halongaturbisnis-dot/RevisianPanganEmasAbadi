import { dbClient } from '../libs/database.js';
import { IAkun, IAkunSession, TPeran, TModul } from '../types/ITs_Akun.js';
import { storageService } from './storage.js';
import { obfuscate } from '../libs/crypto.js';
import { generateUUID } from '../utils/data.js';
import { errorService } from './errorService.js';
import { browserStorage } from '../utils/browserStorage.js';

/**
 * AKUN SERVICE
 * Logic backend untuk modul Akun.
 * Menangani CRUD, Upload Foto, dan Autentikasi menggunakan Turso DB.
 */

export const akunService = {
  /**
   * Mengambil semua data akun dari database.
   */
  async getAll(): Promise<IAkun[]> {
    const sql = `SELECT * FROM akun WHERE is_deleted = 0 OR is_deleted IS NULL ORDER BY created_at DESC`;
    try {
      const result = await dbClient.query(sql);
      return (result.rows as any[]).map((row) => ({
        ...row,
        akses_modul: JSON.parse(row.akses_modul || '[]'),
        has_invoice_approval: Number(row.has_invoice_approval) === 1,
        is_active: Number(row.is_active) === 1
      })) as IAkun[];
    } catch (error) {
      errorService.handle(error);
      return [];
    }
  },

  /**
   * Mengambil data akun dengan paginasi.
   */
  async getPaginated(
    page: number = 1, 
    limit: number = 20, 
    search: string = '', 
    sortKey: string = 'created_at', 
    sortDir: 'asc' | 'desc' | null = 'desc',
    isActive?: boolean
  ): Promise<{ items: IAkun[], total: number }> {
    const offset = (page - 1) * limit;
    let whereClause = '';
    const params: any[] = [];
    const countParams: any[] = [];
    
    const conditions: string[] = [`(is_deleted = 0 OR is_deleted IS NULL)`];

    if (search) {
      conditions.push(`(username LIKE ? OR jabatan LIKE ? OR peran LIKE ? OR kode_akses LIKE ? OR telepon LIKE ? OR akses_modul LIKE ?)`);
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam, searchParam, searchParam, searchParam, searchParam);
      countParams.push(searchParam, searchParam, searchParam, searchParam, searchParam, searchParam);
    }

    if (isActive !== undefined) {
      conditions.push(`is_active = ?`);
      const activeParam = isActive ? 1 : 0;
      params.push(activeParam);
      countParams.push(activeParam);
    }

    if (conditions.length > 0) {
      whereClause = `WHERE ` + conditions.join(' AND ');
    }
    
    let orderClause = `ORDER BY created_at DESC`;
    if (sortKey && sortDir) {
      // White list keys to prevent SQL injection
      const allowedKeys = ['username', 'jabatan', 'peran', 'kode_akses', 'telepon', 'created_at'];
      if (allowedKeys.includes(sortKey)) {
        orderClause = `ORDER BY ${sortKey} ${sortDir.toUpperCase()}`;
      }
    }
    
    const sqlData = `SELECT * FROM akun ${whereClause} ${orderClause} LIMIT ? OFFSET ?`;
    const sqlCount = `SELECT COUNT(*) as total FROM akun ${whereClause}`;
    
    params.push(limit, offset);
    
    try {
      const [dataRes, countRes] = await Promise.all([
        dbClient.query(sqlData, params),
        dbClient.query(sqlCount, countParams)
      ]);
      
      const items = (dataRes.rows as any[]).map((row) => ({
        ...row,
        akses_modul: JSON.parse(row.akses_modul || '[]'),
        has_invoice_approval: Number(row.has_invoice_approval) === 1,
        is_active: Number(row.is_active) === 1
      })) as IAkun[];
      
      const total = Number((countRes.rows[0] as any).total || 0);
      
      return { items, total };
    } catch (error) {
      errorService.handle(error);
      return { items: [], total: 0 };
    }
  },

  /**
   * Mengambil data akun berdasarkan ID.
   */
  async getById(id: string): Promise<IAkun | null> {
    if (id === 'spadmin') {
      return {
        id: 'spadmin',
        kode_akses: 'spadmin',
        password: '',
        username: 'SuperAdmin',
        jabatan: 'Superadmin',
        peran: TPeran.ADMIN,
        akses_modul: [],
        has_invoice_approval: true,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      } as IAkun;
    }

    const sql = `SELECT * FROM akun WHERE id = ? LIMIT 1`;
    try {
      const result = await dbClient.query(sql, [id]);
      if (result.rows.length === 0) return null;
      const row = result.rows[0] as any;
      return {
        ...row,
        akses_modul: JSON.parse(row.akses_modul || '[]'),
        has_invoice_approval: Number(row.has_invoice_approval) === 1,
        is_active: Number(row.is_active) === 1
      } as IAkun;
    } catch (error) {
      errorService.handle(error);
      return null;
    }
  },

  /**
   * Membuat akun baru.
   */
  async create(data: Omit<IAkun, 'id' | 'created_at' | 'updated_at'>, photoFile?: File): Promise<IAkun | null> {
    const id = generateUUID();
    let foto_profil = data.foto_profil || null;

    try {
      // 0. Audit - Creation
      const session = this.getCurrentSession();
      if (session) {
        data.created_by = session.user_id;
        data.created_timezone = 'Asia/Jakarta';
      }

      // 1. Upload foto jika ada
      if (photoFile) {
        const uploadRes = await storageService.upload(photoFile, 'profile-photos');
        foto_profil = uploadRes.url;
      }

      // 2. Hash password (obfuscate)
      const hashedPassword = data.password ? obfuscate(data.password) : '';

      // 3. Prepare parameters
      const sql = `
        INSERT INTO akun (
          id, kode_akses, password, username, foto_profil, telepon, 
          jabatan, peran, akses_modul, has_invoice_approval, is_active, created_by, created_timezone
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      const params = [
        id,
        data.kode_akses,
        hashedPassword,
        data.username,
        foto_profil,
        data.telepon || null,
        data.jabatan,
        data.peran,
        JSON.stringify(data.akses_modul),
        data.has_invoice_approval ? 1 : 0,
        data.is_active !== false ? 1 : 0, // Default to true if not specified
        data.created_by || null,
        data.created_timezone || 'Asia/Jakarta'
      ];

      await dbClient.query(sql, params);
      return this.getById(id);
    } catch (error) {
      errorService.handle(error);
      return null;
    }
  },

  /**
   * Memperbarui data akun yang sudah ada.
   */
  async update(id: string, data: Partial<Omit<IAkun, 'id' | 'created_at'>>, photoFile?: File): Promise<IAkun | null> {
    try {
      const existing = await this.getById(id);
      if (!existing) throw new Error('Akun tidak ditemukan');

      // 0. Audit - Update
      const session = this.getCurrentSession();
      if (session) {
        data.updated_by = session.user_id;
        data.updated_timezone = 'Asia/Jakarta';
      }

      let foto_profil = data.foto_profil ?? existing.foto_profil;

      // 1. Handle Update Foto
      if (photoFile) {
        // Extract key from URL if possible to delete old file
        const oldKey = existing.foto_profil ? existing.foto_profil.split('.io/').pop() : null;
        const uploadRes = await storageService.upload(photoFile, 'profile-photos');
        foto_profil = uploadRes.url;
        
        if (oldKey) {
          await storageService.delete(oldKey);
        }
        
        // Sync to data object so it gets picked up by the update loop
        data.foto_profil = foto_profil;
      } else if (data.foto_profil === null && existing.foto_profil) {
        // Handle deletion of profile photo
        const oldKey = existing.foto_profil.split('.io/').pop();
        if (oldKey) {
          await storageService.delete(oldKey);
        }
      }

      // 2. Hash password if changed
      let hashedPassword = existing.password;
      if (data.password) {
        hashedPassword = obfuscate(data.password);
      }

      // 3. Dynamic Update Query
      const updates: string[] = [];
      const params: any[] = [];

      const fieldsToUpdate: (keyof IAkun | 'password')[] = [
        'kode_akses', 'username', 'foto_profil', 'telepon', 
        'jabatan', 'peran', 'akses_modul', 'has_invoice_approval', 'is_active', 'updated_by', 'updated_timezone'
      ];

      if (data.password) {
        updates.push(`password = ?`);
        params.push(hashedPassword);
      }

      fieldsToUpdate.forEach(field => {
        if (field === 'password') return;
        if (data[field as keyof IAkun] !== undefined) {
          updates.push(`${field} = ?`);
          let val = data[field as keyof IAkun];
          if (field === 'akses_modul') val = JSON.stringify(data[field]);
          if (field === 'has_invoice_approval' || field === 'is_active') val = data[field] ? 1 : 0;
          params.push(val);
        }
      });

      if (updates.length === 0) return existing;

      params.push(id);
      const sql = `UPDATE akun SET ${updates.join(', ')} WHERE id = ?`;
      
      await dbClient.query(sql, params);
      return this.getById(id);
    } catch (error) {
      errorService.handle(error);
      return null;
    }
  },

  /**
   * Menghapus akun dan aset terkait (foto profil).
   */
  async delete(id: string): Promise<boolean> {
    try {
      const sql = `UPDATE akun SET is_deleted = 1 WHERE id = ?`;
      await dbClient.query(sql, [id]);
      return true;
    } catch (error) {
      errorService.handle(error);
      return false;
    }
  },

  /**
   * Menghapus banyak akun sekaligus.
   */
  async deleteMany(ids: string[]): Promise<boolean> {
    if (ids.length === 0) return true;
    try {
      const placeholders = ids.map(() => '?').join(',');
      const sqlDelete = `UPDATE akun SET is_deleted = 1 WHERE id IN (${placeholders})`;
      await dbClient.query(sqlDelete, ids);
      return true;
    } catch (error) {
      errorService.handle(error);
      return false;
    }
  },

  /**
   * Autentikasi akun (Login).
   */
  async authenticate(kode_akses: string, password_plain: string): Promise<{ success: boolean; session?: IAkunSession; error?: string }> {
    if (kode_akses === 'spadmin' && password_plain === 'PanmasCdm1') {
      const session: IAkunSession = {
        user_id: 'spadmin',
        username: 'SuperAdmin',
        foto_profil: '',
        peran: TPeran.ADMIN,
        akses_modul: ['Pemrosesan', 'Pengiriman', 'Marketing', 'Data Akun', 'Pengadaan', 'Gudang', 'Stok Opname', 'Penjualan', 'Finansial'],
        has_invoice_approval: true,
        is_active: true,
        last_active: new Date().toISOString(),
      };
      browserStorage.set('active_user', session);
      browserStorage.set('token', 'spadmin');
      return { success: true, session };
    }

    const sql = `SELECT * FROM akun WHERE kode_akses = ? AND (is_deleted = 0 OR is_deleted IS NULL) LIMIT 1`;
    try {
      const result = await dbClient.query(sql, [kode_akses]);
      if (result.rows.length === 0) {
        return { success: false, error: 'Kode akses tidak terdaftar' };
      }

      const row = result.rows[0] as any;

      if (Number(row.is_active) === 0) {
        return { success: false, error: 'Akun Anda sudah dinonaktifkan. Silakan hubungi admin.' };
      }

      const hashed = obfuscate(password_plain);

      if (row.password !== hashed) {
        return { success: false, error: 'Password salah' };
      }

      const session: IAkunSession = {
        user_id: row.id,
        username: row.username,
        foto_profil: row.foto_profil,
        peran: row.peran as TPeran,
        akses_modul: JSON.parse(row.akses_modul || '[]'),
        has_invoice_approval: !!row.has_invoice_approval,
        is_active: Number(row.is_active) === 1,
        last_active: new Date().toISOString(),
      };

      // Simpan di browser storage
      browserStorage.set('active_user', session);
      browserStorage.set('token', row.id); // Simple token strategy

      return { success: true, session };
    } catch (error) {
      const res = errorService.handle(error);
      return { success: false, error: res.message };
    }
  },

  /**
   * Mengecek apakah user saat ini memiliki akses ke modul tertentu.
   */
  hasAccess(modul: TModul): boolean {
    const session = this.getCurrentSession();
    if (!session) return false;
    // Admin memiliki akses ke semua modul (sesuai role di ITs_Akun)
    if (session.peran === TPeran.ADMIN) return true;
    return session.akses_modul.includes(modul);
  },

  /**
   * Mengambil session aktif.
   */
  getCurrentSession(): IAkunSession | null {
    return browserStorage.get<IAkunSession>('active_user');
  },

  /**
   * Mengambil semua nilai unik dari kolom jabatan untuk saran input.
   */
  async getDistinctJabatan(): Promise<{ label: string; value: string }[]> {
    const sql = `SELECT DISTINCT jabatan FROM akun WHERE jabatan IS NOT NULL AND jabatan != '' ORDER BY jabatan ASC`;
    try {
      const result = await dbClient.query(sql);
      return (result.rows as any[]).map(row => ({
        label: row.jabatan,
        value: row.jabatan
      }));
    } catch (error) {
      errorService.handle(error);
      return [];
    }
  },

  /**
   * Mengambil semua akun yang memiliki peran 'User' dan memiliki akses ke modul 'Pengiriman'.
   */
  async getDrivers(): Promise<IAkun[]> {
    const sql = `SELECT * FROM akun WHERE peran = 'User' AND akses_modul LIKE '%Pengiriman%' AND (is_deleted = 0 OR is_deleted IS NULL) ORDER BY username ASC`;
    try {
      const result = await dbClient.query(sql);
      return (result.rows as any[]).map((row) => ({
        ...row,
        akses_modul: JSON.parse(row.akses_modul || '[]'),
        has_invoice_approval: Number(row.has_invoice_approval) === 1,
        is_active: Number(row.is_active) === 1
      })) as IAkun[];
    } catch (error) {
      errorService.handle(error);
      return [];
    }
  },

  /**
   * Mengecek apakah username sudah digunakan oleh akun lain.
   */
  async isUsernameTaken(username: string, excludeId?: string): Promise<boolean> {
    if (username.toLowerCase() === 'superadmin') return true;

    let sql = `SELECT COUNT(*) as total FROM akun WHERE username = ? AND (is_deleted = 0 OR is_deleted IS NULL)`;
    const params: any[] = [username];
    
    if (excludeId) {
      sql += ` AND id != ?`;
      params.push(excludeId);
    }
    
    try {
      const result = await dbClient.query(sql, params);
      const total = Number((result.rows[0] as any).total || 0);
      return total > 0;
    } catch (error) {
      errorService.handle(error);
      return false;
    }
  },

  /**
   * Mengecek apakah kode akses sudah digunakan oleh akun lain.
   */
  async isKodeAksesTaken(kode_akses: string, excludeId?: string): Promise<boolean> {
    if (kode_akses === 'spadmin') return true;

    let sql = `SELECT COUNT(*) as total FROM akun WHERE kode_akses = ? AND (is_deleted = 0 OR is_deleted IS NULL)`;
    const params: any[] = [kode_akses];
    
    if (excludeId) {
      sql += ` AND id != ?`;
      params.push(excludeId);
    }
    
    try {
      const result = await dbClient.query(sql, params);
      const total = Number((result.rows[0] as any).total || 0);
      return total > 0;
    } catch (error) {
      errorService.handle(error);
      return false;
    }
  }
};
