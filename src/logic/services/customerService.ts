import { dbClient } from '../libs/database';
import { ICustomer } from '../types/ITs_Customer';
import { errorService } from './errorService';
import { akunService } from './akunService';
import { generateUUID } from '../utils/data';
import { getPageFetchLimit } from './fetchingCenter';

/**
 * CUSTOMER SERVICE
 * Logic backend untuk modul Customer.
 * Menangani CRUD dan Integrasi Database Turso sesuai CustomerTable.sql.
 */

export const customerService = {
  /**
   * Mengambil semua data customer.
   * Cocok untuk dropdown atau data berjumlah sedikit.
   */
  async getAll(): Promise<ICustomer[]> {
    const sql = `SELECT * FROM customer WHERE is_deleted = 0 OR is_deleted IS NULL ORDER BY name ASC`;
    try {
      const result = await dbClient.query(sql);
      return result.rows as unknown as ICustomer[];
    } catch (error) {
      errorService.handle(error);
      return [];
    }
  },

  /**
   * Mengambil data customer dengan paginasi dan pencarian.
   * Digunakan oleh DataTablePlus atau List view besar.
   */
  async getPaginated(
    page: number = 1,
    search: string = '',
    limit?: number,
    sortKey: string = 'name',
    sortDir: 'asc' | 'desc' = 'asc'
  ): Promise<{ items: ICustomer[]; total: number }> {
    // 1. Determine limit
    const fetchLimit = limit || getPageFetchLimit('DaftarCustomer');
    const offset = (page - 1) * fetchLimit;

    // 2. Build Query
    let whereClause = '';
    const params: any[] = [];
    const countParams: any[] = [];

    if (search) {
      whereClause = `WHERE (name LIKE ? OR telepon LIKE ? OR email LIKE ? OR alamat LIKE ? OR company LIKE ? OR bidang_usaha LIKE ?) AND (is_deleted = 0 OR is_deleted IS NULL)`;
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam, searchParam, searchParam, searchParam, searchParam);
      countParams.push(searchParam, searchParam, searchParam, searchParam, searchParam, searchParam);
    } else {
      whereClause = `WHERE is_deleted = 0 OR is_deleted IS NULL`;
    }

    // White list for sort keys
    const allowedSortKeys = ['name', 'telepon', 'email', 'alamat', 'company', 'created_at', 'bidang_usaha'];
    const finalSortKey = allowedSortKeys.includes(sortKey) ? sortKey : 'name';
    const finalSortDir = sortDir?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    
    const sqlData = `
      SELECT * FROM customer 
      ${whereClause} 
      ORDER BY ${finalSortKey} ${finalSortDir} 
      LIMIT ? OFFSET ?
    `;
    const sqlCount = `SELECT COUNT(*) as total FROM customer ${whereClause}`;

    params.push(fetchLimit, offset);

    try {
      const [dataRes, countRes] = await Promise.all([
        dbClient.query(sqlData, params),
        dbClient.query(sqlCount, countParams)
      ]);

      const items = dataRes.rows as unknown as ICustomer[];
      const total = Number((countRes.rows[0] as any).total || 0);

      return { items, total };
    } catch (error) {
      errorService.handle(error);
      return { items: [], total: 0 };
    }
  },

  /**
   * Mengambil detail customer berdasarkan ID.
   */
  async getById(id: string): Promise<ICustomer | null> {
    const sql = `SELECT * FROM customer WHERE id = ? LIMIT 1`;
    try {
      const result = await dbClient.query(sql, [id]);
      if (result.rows.length === 0) return null;
      return result.rows[0] as unknown as ICustomer;
    } catch (error) {
      errorService.handle(error);
      return null;
    }
  },

  /**
   * Membuat customer baru.
   */
  async create(data: Omit<ICustomer, 'id' | 'created_at' | 'updated_at'>): Promise<ICustomer | null> {
    const id = generateUUID();
    
    try {
      // 1. Audit Trail - Creation
      const session = akunService.getCurrentSession();
      const createdBy = session?.user_id || null;
      const timezone = 'Asia/Jakarta';

      const sql = `
        INSERT INTO customer (
          id, name, company, telepon, email, latlong, alamat, bidang_usaha,
          created_by, created_timezone
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const params = [
        id,
        data.name,
        data.company || null,
        data.telepon,
        data.email || null,
        data.latlong,
        data.alamat,
        data.bidang_usaha || null,
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
   * Memperbarui data customer.
   */
  async update(id: string, data: Partial<ICustomer>): Promise<ICustomer | null> {
    try {
      const existing = await this.getById(id);
      if (!existing) throw new Error('Data customer tidak ditemukan');

      // 1. Audit Trail - Update
      const session = akunService.getCurrentSession();
      const updatedBy = session?.user_id || null;
      const timezone = 'Asia/Jakarta';

      // 2. Build Dynamic Query
      const updates: string[] = [];
      const params: any[] = [];

      const fieldsToUpdate: (keyof ICustomer)[] = [
        'name', 'company', 'telepon', 'email', 'latlong', 'alamat', 'bidang_usaha'
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
        
        // updated_at ditangani oleh trigger SQL di database
        
        params.push(id);
        const sql = `UPDATE customer SET ${updates.join(', ')} WHERE id = ?`;
        await dbClient.query(sql, params);
      }

      return await this.getById(id);
    } catch (error) {
      errorService.handle(error);
      return null;
    }
  },

  /**
   * Menghapus customer.
   */
  async delete(id: string): Promise<boolean> {
    const sql = `UPDATE customer SET is_deleted = 1 WHERE id = ?`;
    try {
      await dbClient.query(sql, [id]);
      return true;
    } catch (error) {
      errorService.handle(error);
      return false;
    }
  },

  /**
   * Mengambil semua nilai unik dari kolom bidang_usaha untuk saran input.
   */
  async getDistinctBidangUsaha(): Promise<{ label: string; value: string }[]> {
    const sql = `SELECT DISTINCT bidang_usaha FROM customer WHERE bidang_usaha IS NOT NULL AND bidang_usaha != '' ORDER BY bidang_usaha ASC`;
    try {
      const result = await dbClient.query(sql);
      return (result.rows as any[]).map(row => ({
        label: row.bidang_usaha,
        value: row.bidang_usaha
      }));
    } catch (error) {
      errorService.handle(error);
      return [];
    }
  },

  /**
   * Mengambil atau membuat "Customer Umum" sebagai fallback jika customer tidak dipilih.
   */
  async getOrCreateGeneralCustomer(): Promise<ICustomer> {
    try {
      const sqlCheck = `SELECT * FROM customer WHERE name = 'Customer Umum' LIMIT 1`;
      const res = await dbClient.query(sqlCheck);
      
      if (res.rows.length > 0) {
        return res.rows[0] as unknown as ICustomer;
      }

      // Jika belum ada, buat otomatis
      const newCustomer = await this.create({
        name: 'Customer Umum',
        company: 'Intern',
        telepon: '-',
        email: 'umum@ngaturbisnis.com',
        latlong: '0,0',
        alamat: 'Internal',
        bidang_usaha: 'Umum'
      });

      return newCustomer!;
    } catch (error) {
      console.error('Gagal getOrCreateGeneralCustomer:', error);
      // Fallback object jika benar-benar gagal (meskipun ini tidak ideal)
      return { id: 'umum-fallback', name: 'Customer Umum' } as ICustomer;
    }
  },
};
