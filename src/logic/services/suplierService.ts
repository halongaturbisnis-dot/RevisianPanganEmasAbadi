import { dbClient } from '../libs/database';
import { ISuplier } from '../types/ITs_Suplier';
import { errorService } from './errorService';
import { akunService } from './akunService';
import { generateUUID } from '../utils/data';
import { getPageFetchLimit } from './fetchingCenter';

/**
 * SUPLIER SERVICE
 * Logic backend untuk modul Suplier (Pengadaan).
 * Menangani CRUD dan Integrasi Database Turso sesuai SuplierTable.sql.
 */

export const suplierService = {
  /**
   * Mengambil semua data suplier.
   * Cocok untuk dropdown atau data berjumlah sedikit.
   */
  async getAll(): Promise<ISuplier[]> {
    const sql = `SELECT * FROM suplier WHERE is_deleted = 0 OR is_deleted IS NULL ORDER BY name ASC`;
    try {
      const result = await dbClient.query(sql);
      return result.rows as unknown as ISuplier[];
    } catch (error) {
      errorService.handle(error);
      return [];
    }
  },

  /**
   * Mengambil data suplier dengan paginasi dan pencarian.
   * Digunakan oleh DataTablePlus atau List view besar.
   */
  async getPaginated(
    page: number = 1,
    search: string = '',
    limit?: number,
    sortKey: string = 'name',
    sortDir: 'asc' | 'desc' = 'asc'
  ): Promise<{ items: ISuplier[]; total: number }> {
    // 1. Determine limit
    const fetchLimit = limit || getPageFetchLimit('DaftarSuplier');
    const offset = (page - 1) * fetchLimit;

    // 2. Build Query
    let whereClause = '';
    const params: any[] = [];
    const countParams: any[] = [];

    if (search) {
      whereClause = `WHERE (name LIKE ? OR telepon LIKE ? OR email LIKE ? OR alamat LIKE ? OR bank_name LIKE ?) AND (is_deleted = 0 OR is_deleted IS NULL)`;
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam, searchParam, searchParam, searchParam);
      countParams.push(searchParam, searchParam, searchParam, searchParam, searchParam);
    } else {
      whereClause = `WHERE is_deleted = 0 OR is_deleted IS NULL`;
    }

    // White list for sort keys
    const allowedSortKeys = ['name', 'telepon', 'email', 'alamat', 'created_at'];
    const finalSortKey = allowedSortKeys.includes(sortKey) ? sortKey : 'name';
    const finalSortDir = sortDir?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    
    const sqlData = `
      SELECT * FROM suplier 
      ${whereClause} 
      ORDER BY ${finalSortKey} ${finalSortDir} 
      LIMIT ? OFFSET ?
    `;
    const sqlCount = `SELECT COUNT(*) as total FROM suplier ${whereClause}`;

    params.push(fetchLimit, offset);

    try {
      const [dataRes, countRes] = await Promise.all([
        dbClient.query(sqlData, params),
        dbClient.query(sqlCount, countParams)
      ]);

      const items = dataRes.rows as unknown as ISuplier[];
      const total = Number((countRes.rows[0] as any).total || 0);

      return { items, total };
    } catch (error) {
      errorService.handle(error);
      return { items: [], total: 0 };
    }
  },

  /**
   * Mengambil detail suplier berdasarkan ID.
   */
  async getById(id: string): Promise<ISuplier | null> {
    const sql = `SELECT * FROM suplier WHERE id = ? LIMIT 1`;
    try {
      const result = await dbClient.query(sql, [id]);
      if (result.rows.length === 0) return null;
      return result.rows[0] as unknown as ISuplier;
    } catch (error) {
      errorService.handle(error);
      return null;
    }
  },

  /**
   * Membuat suplier baru.
   */
  async create(data: Omit<ISuplier, 'id' | 'created_at' | 'updated_at'>): Promise<ISuplier | null> {
    const id = generateUUID();
    
    try {
      // 1. Audit Trail - Creation
      const session = akunService.getCurrentSession();
      const createdBy = session?.user_id || null;
      const timezone = 'Asia/Jakarta';

      const sql = `
        INSERT INTO suplier (
          id, name, telepon, email, latlong, alamat, 
          bank_name, no_rekening, nama_pemilik_rekening,
          created_by, created_timezone
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const params = [
        id,
        data.name,
        data.telepon,
        data.email || null,
        data.latlong,
        data.alamat,
        data.bank_name || null,
        data.no_rekening || null,
        data.nama_pemilik_rekening || null,
        createdBy,
        timezone
      ];

      await dbClient.query(sql, params);
      return await this.getById(id);
    } catch (error) {
      errorService.handle(error);
      return null;
    }
  },

  /**
   * Memperbarui data suplier.
   */
  async update(id: string, data: Partial<ISuplier>): Promise<ISuplier | null> {
    try {
      const existing = await this.getById(id);
      if (!existing) throw new Error('Data suplier tidak ditemukan');

      // 1. Audit Trail - Update
      const session = akunService.getCurrentSession();
      const updatedBy = session?.user_id || null;
      const timezone = 'Asia/Jakarta';

      // 2. Build Dynamic Query
      const updates: string[] = [];
      const params: any[] = [];

      const fieldsToUpdate: (keyof ISuplier)[] = [
        'name', 'telepon', 'email', 'latlong', 'alamat', 'bank_name', 'no_rekening', 'nama_pemilik_rekening'
      ];

      fieldsToUpdate.forEach(field => {
        if (data[field] !== undefined) {
          updates.push(`${field} = ?`);
          params.push(data[field]);
        }
      });

      // Always add update audit if any data changed
      if (updates.length > 0) {
        updates.push(`updated_by = ?`, `updated_timezone = ?`);
        params.push(updatedBy, timezone);
        
        // updated_at ditangani oleh trigger SQL
        
        params.push(id);
        const sql = `UPDATE suplier SET ${updates.join(', ')} WHERE id = ?`;
        await dbClient.query(sql, params);
      }

      return await this.getById(id);
    } catch (error) {
      errorService.handle(error);
      return null;
    }
  },

  /**
   * Menghapus suplier.
   */
  async delete(id: string): Promise<boolean> {
    const sql = `UPDATE suplier SET is_deleted = 1 WHERE id = ?`;
    try {
      await dbClient.query(sql, [id]);
      return true;
    } catch (error) {
      errorService.handle(error);
      return false;
    }
  }
};
