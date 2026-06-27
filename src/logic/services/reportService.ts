import { dbClient } from '../libs/database';
import { ITs_Penjualan, ITs_PenjualanProduk } from '../types/ITs_Penjualan';
import { errorService } from './errorService';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, eachWeekOfInterval, isSameDay, isSameWeek } from 'date-fns';
import { id } from 'date-fns/locale';

export interface SalesReportSummary {
  totalRevenue: number;
  totalMargin: number;
  totalOrders: number;
  totalQtySold: number;
  avgOrderValue: number;
}

export interface TrendData {
  label: string;
  totalSales: number;
  totalPayment: number;
  totalPiutang: number;
}

export interface TopProductData {
  sku: string;
  name: string;
  qty: number;
  revenue: number;
  margin: number;
}

export interface CustomerTypeData {
  type: 'Baru' | 'Lama';
  count: number;
  percentage: number;
}

export interface PaymentTypeData {
  type: 'Lunas' | 'Tempo';
  count: number;
  percentage: number;
  nominal: number;
}

export interface ProductTypeData {
  type: 'Reguler' | 'Mixing' | 'Dropship';
  nominal: number;
}

export interface ShippingTypeData {
  type: 'Loco' | 'Franco';
  count: number;
  percentage: number;
}

export interface KlaimReturTrendData {
  label: string;
  totalRefund: number;
  totalCount: number;
}

export interface PaymentSourceData {
  label: string;
  count: number;
  percentage: number;
}

export const reportService = {
  /**
   * Get comprehensive sales report data within a date range
   */
  async getSalesReport(startDate: string, endDate: string) {
    try {
      // 1. Fetch Approved Sales in range with Customer name
      const sqlSales = `
        SELECT 
          p.id, 
          p.sales_id, p.sales_name, p.invoice_number, p.customer_id,
          p.sum_product_price, p.sum_added_cost, p.discount_type, p.discount_value, p.discount_amount, p.grand_total,
          p.payment_type, 
          COALESCE((SELECT SUM(amount) FROM pemasukan WHERE sales_id = p.id), 0) as deposit,
          p.sla_date,
          p.payment_method, p.bank_cash_source_id, p.payment_proof_fileurls, p.keterangan, p.status, p.invoice_pdf_url,
          p.approver_id, p.approver_name, p.approval_status, p.approval_signature_url, p.approval_at, p.approval_note,
          p.created_at, p.created_by, p.created_timezone, p.updated_at, p.updated_by, p.updated_timezone,
          p.datetime as datetime,
          c.name as customer_name
        FROM penjualan p
        LEFT JOIN customer c ON p.customer_id = c.id
        WHERE p.approval_status = 'Approved'
        AND date(p.datetime) BETWEEN date(?) AND date(?)
        ORDER BY p.datetime DESC
      `;
      
      const salesRes = await dbClient.query(sqlSales, [startDate, endDate]);
      const rawSales = salesRes.rows as any[];
      
      const sales = rawSales.map(s => ({
        ...s,
        outstanding: (s.grand_total || 0) - (s.deposit || 0)
      })) as unknown as (ITs_Penjualan & { customer_name: string })[];

      // 2. Fetch all products for these sales to calculate top products and margin details
      const salesIds = sales.map(s => s.id);
      let products: ITs_PenjualanProduk[] = [];
      
      if (salesIds.length > 0) {
        const placeholders = salesIds.map(() => '?').join(',');
        const sqlProducts = `
          SELECT pp.* 
          FROM penjualan_produk pp
          WHERE pp.penjualan_id IN (${placeholders})
        `;
        const productsRes = await dbClient.query(sqlProducts, salesIds);
        products = productsRes.rows as unknown as ITs_PenjualanProduk[];
      }

      // 3. Fetch Piutang and Payments for the period
      const sqlPiutang = `
        SELECT 
          p.id, p.name, p.description, p.category, p.sales_id, p.entity_name,
          p.principal_amount, p.paid_amount, p.outstanding_amount, p.due_date, p.status,
          p.created_at, p.created_by, p.created_timezone, p.updated_at, p.updated_by, p.updated_timezone,
          p.datetime as datetime
        FROM piutang p
        WHERE date(p.datetime) BETWEEN date(?) AND date(?)
      `;
      const piutangRes = await dbClient.query(sqlPiutang, [startDate, endDate]);
      const piutangs = piutangRes.rows as any[];

      const sqlPayments = `
        SELECT 
          pp.id, pp.piutang_id, pp.amount, pp.payment_method, pp.bank_and_cash_id, pp.income_id, pp.description, pp.proof_urls, pp.next_sla,
          pp.created_at, pp.created_by, pp.created_timezone, pp.updated_at, pp.updated_by, pp.updated_timezone,
          pp.payment_date as payment_date,
          bac.nama_akun as bank_name 
        FROM piutang_pembayaran pp
        JOIN piutang p ON pp.piutang_id = p.id
        LEFT JOIN bank_and_cash bac ON pp.bank_and_cash_id = bac.id
        WHERE p.category = 'Penjualan'
        AND date(pp.payment_date) BETWEEN date(?) AND date(?)
      `;
      const paymentsRes = await dbClient.query(sqlPayments, [startDate, endDate]);
      const payments = paymentsRes.rows as any[];

      // 3.B Fetch Bank Names for Penjualan
      const sqlSalesWithBanks = `
        SELECT p.payment_type, p.deposit, bac.nama_akun as bank_name
        FROM penjualan p
        LEFT JOIN bank_and_cash bac ON p.bank_cash_source_id = bac.id
        WHERE p.approval_status = 'Approved'
        AND date(p.datetime) BETWEEN date(?) AND date(?)
      `;
      const salesWithBanksRes = await dbClient.query(sqlSalesWithBanks, [startDate, endDate]);
      const salesWithBanks = salesWithBanksRes.rows as any[];

      // 3.C Fetch Shipping Types (Loco/Franco)
      const sqlShipping = `
        SELECT penyerahan_type, COUNT(*) as count 
        FROM penyerahan 
        WHERE status != 'Cancelled'
        AND penjualan_id IN (
          SELECT id FROM penjualan 
          WHERE date(datetime) BETWEEN date(?) AND date(?) 
          AND approval_status = 'Approved'
        )
        GROUP BY penyerahan_type
      `;
      const shippingRes = await dbClient.query(sqlShipping, [startDate, endDate]);
      const shippingStatsRaw = shippingRes.rows as any[];

      // 3.D Fetch Klaim Retur daily data
      const sqlKlaim = `
        SELECT 
          datetime as datetime,
          sum_total_refund_nominal
        FROM klaim_retur
        WHERE date(datetime) BETWEEN date(?) AND date(?)
        AND status != 'Rejected'
      `;
      const klaimRes = await dbClient.query(sqlKlaim, [startDate, endDate]);
      const klaimData = klaimRes.rows as any[];

      // 4. Process Summary
      const summary: SalesReportSummary = {
        totalRevenue: sales.reduce((acc, s) => acc + s.grand_total, 0),
        totalMargin: products.reduce((acc, p) => acc + (p.margin_amount || 0), 0),
        totalOrders: sales.length,
        totalQtySold: products.reduce((acc, p) => acc + p.qty, 0),
        avgOrderValue: sales.length > 0 ? sales.reduce((acc, s) => acc + s.grand_total, 0) / sales.length : 0
      };

      // 5. Process Daily Trend
      const dailyTrend = this._generateDailyTrend(startDate, endDate, sales, piutangs, payments);

      // 6. Process Top Products (by Revenue and by Margin)
      const topByQty = this._generateTopProducts(products, 'qty');
      const topByMargin = this._generateTopProducts(products, 'margin');
      const topByRevenue = this._generateTopProducts(products, 'revenue');

      // 7. Process Specialized Stats
      const customerTypeStats = await this._generateCustomerTypeStats(sales);
      const paymentTypeStats = this._generatePaymentTypeStats(sales);
      const productTypeStats = this._generateProductTypeStats(products);
      const paymentSourceStats = this._generatePaymentSourceStats(salesWithBanks, payments);
      const shippingTypeStats = this._generateShippingStats(shippingStatsRaw);
      const klaimReturTrend = this._generateKlaimReturTrend(startDate, endDate, klaimData);

      return {
        summary,
        dailyTrend,
        topByQty,
        topByMargin,
        topByRevenue,
        customerTypeStats,
        paymentTypeStats,
        productTypeStats,
        paymentSourceStats,
        shippingTypeStats,
        klaimReturTrend,
        sales
      };
    } catch (error) {
      errorService.handle(error);
      return null;
    }
  },

  async _generateCustomerTypeStats(sales: ITs_Penjualan[]): Promise<CustomerTypeData[]> {
    const uniqueCustomerIds = Array.from(new Set(sales.map(s => s.customer_id).filter(Boolean)));
    if (uniqueCustomerIds.length === 0) return [];

    let newUserCount = 0;
    let oldUserCount = 0;

    // Count lifetime transactions for each customer to determine type
    const placeholders = uniqueCustomerIds.map(() => '?').join(',');
    const sqlCount = `
      SELECT customer_id, COUNT(*) as total_count
      FROM penjualan 
      WHERE customer_id IN (${placeholders})
      AND approval_status = 'Approved'
      GROUP BY customer_id
    `;
    
    const countsRes = await dbClient.query(sqlCount, uniqueCustomerIds);
    const counts = (countsRes.rows as any[]).reduce((acc, r) => {
      acc[r.customer_id] = r.total_count;
      return acc;
    }, {} as Record<string, number>);

    uniqueCustomerIds.forEach(id => {
      const totalCount = counts[id] || 0;
      // Per request: > 1 is 'Lama', 1 is 'Baru'
      if (totalCount > 1) {
        oldUserCount++;
      } else {
        newUserCount++;
      }
    });

    const total = newUserCount + oldUserCount;
    return [
      { type: 'Baru', count: newUserCount, percentage: total > 0 ? (newUserCount / total) * 100 : 0 },
      { type: 'Lama', count: oldUserCount, percentage: total > 0 ? (oldUserCount / total) * 100 : 0 }
    ];
  },

  _generatePaymentTypeStats(sales: ITs_Penjualan[]): PaymentTypeData[] {
    let lunasCount = 0;
    let tempoCount = 0;
    let lunasNominal = 0;
    let tempoNominal = 0;

    sales.forEach(s => {
      if (s.payment_type === 'Tempo') {
        tempoCount++;
        tempoNominal += s.grand_total;
      } else {
        lunasCount++;
        lunasNominal += s.grand_total;
      }
    });

    const totalCount = lunasCount + tempoCount;
    return [
      { type: 'Lunas', count: lunasCount, percentage: totalCount > 0 ? (lunasCount / totalCount) * 100 : 0, nominal: lunasNominal },
      { type: 'Tempo', count: tempoCount, percentage: totalCount > 0 ? (tempoCount / totalCount) * 100 : 0, nominal: tempoNominal }
    ];
  },

  _generateProductTypeStats(products: ITs_PenjualanProduk[]): ProductTypeData[] {
    let regulerNominal = 0;
    let mixingNominal = 0;
    let dropshipNominal = 0;

    products.forEach(p => {
      if (p.is_dropship) {
        dropshipNominal += p.total_selling_price;
      } else if (p.is_mixing) {
        mixingNominal += p.total_selling_price;
      } else {
        regulerNominal += p.total_selling_price;
      }
    });

    return [
      { type: 'Reguler', nominal: regulerNominal },
      { type: 'Mixing', nominal: mixingNominal },
      { type: 'Dropship', nominal: dropshipNominal }
    ];
  },

  _generateDailyTrend(start: string, end: string, sales: ITs_Penjualan[], piutangs: any[], payments: any[]): TrendData[] {
    const interval = eachDayOfInterval({ start: new Date(start), end: new Date(end) });
    
    // Helper to ensure database string is treated as local timezone
    const toUtcDate = (dateStr: string) => {
      if (!dateStr) return new Date(0);
      const normalized = dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T');
      return new Date(normalized);
    };

    return interval.map(day => {
      const daySales = sales.filter(s => isSameDay(toUtcDate(s.datetime), day));
      const dayPiutangs = piutangs.filter(p => isSameDay(toUtcDate(p.datetime), day));
      const dayPayments = payments.filter(p => isSameDay(toUtcDate(p.payment_date), day));

      // Total Penjualan
      const totalSales = daySales.reduce((acc, s) => acc + s.grand_total, 0);

      // Total Pembayaran = (Cash Sales) + (Deposits) + (Piutang Payments)
      const cashSalesAndDeposits = daySales.reduce((acc, s) => {
        if (s.payment_type === 'Lunas') return acc + s.grand_total;
        return acc + (s.deposit || 0);
      }, 0);
      const totalPiutangPayments = dayPayments.reduce((acc, p) => acc + p.amount, 0);
      const totalPayment = cashSalesAndDeposits + totalPiutangPayments;

      // Total Piutang (New debt created on this day)
      const totalPiutang = dayPiutangs.reduce((acc, p) => acc + p.principal_amount, 0);

      return {
        label: format(day, 'dd MMM', { locale: id }),
        totalSales,
        totalPayment,
        totalPiutang
      };
    });
  },

  _generateTopProducts(products: ITs_PenjualanProduk[], sortBy: 'qty' | 'margin' | 'revenue'): TopProductData[] {
    const productMap = new Map<string, TopProductData>();

    products.forEach(p => {
      const key = p.sku || p.name;
      const existing = productMap.get(key) || { 
        sku: p.sku || '-', 
        name: p.name, 
        qty: 0, 
        revenue: 0, 
        margin: 0 
      };

      existing.qty += p.qty;
      existing.revenue += p.total_selling_price;
      existing.margin += (p.margin_amount || 0);
      
      productMap.set(key, existing);
    });

    return Array.from(productMap.values())
      .sort((a, b) => b[sortBy] - a[sortBy])
      .slice(0, 10);
  },

  _generatePaymentSourceStats(sales: any[], payments: any[]): PaymentSourceData[] {
    const sourceMap = new Map<string, number>();

    // From Sales (Cash sales or Tempo with deposit)
    sales.forEach(s => {
      if (s.payment_type === 'Lunas' || (s.payment_type === 'Tempo' && s.deposit > 0)) {
        const bankName = s.bank_name || 'Tidak Terdefinisi';
        sourceMap.set(bankName, (sourceMap.get(bankName) || 0) + 1);
      }
    });

    // From Piutang Payments (Filtered to Penjualan category in SQL query)
    payments.forEach(p => {
      const bankName = p.bank_name || 'Tidak Terdefinisi';
      sourceMap.set(bankName, (sourceMap.get(bankName) || 0) + 1);
    });

    const total = Array.from(sourceMap.values()).reduce((acc, count) => acc + count, 0);

    return Array.from(sourceMap.entries()).map(([label, count]) => ({
      label,
      count,
      percentage: total > 0 ? (count / total) * 100 : 0
    })).sort((a, b) => b.count - a.count);
  },

  _generateShippingStats(raw: any[]): ShippingTypeData[] {
    const total = raw.reduce((acc, r) => acc + r.count, 0);
    const locoCount = raw.find(r => r.penyerahan_type === 'Loco')?.count || 0;
    const francoCount = raw.find(r => r.penyerahan_type === 'Franco')?.count || 0;

    return [
      { type: 'Loco', count: locoCount, percentage: total > 0 ? (locoCount / total) * 100 : 0 },
      { type: 'Franco', count: francoCount, percentage: total > 0 ? (francoCount / total) * 100 : 0 }
    ];
  },

  _generateKlaimReturTrend(start: string, end: string, klaimData: any[]): KlaimReturTrendData[] {
    const interval = eachDayOfInterval({ start: new Date(start), end: new Date(end) });
    
    const toUtcDate = (dateStr: string) => {
      if (!dateStr) return new Date(0);
      const normalized = dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T');
      return new Date(normalized);
    };

    return interval.map(day => {
      const dayKlaims = klaimData.filter(k => isSameDay(toUtcDate(k.datetime), day));
      
      const totalRefund = dayKlaims.reduce((acc, k) => acc + (k.sum_total_refund_nominal || 0), 0);
      const totalCount = dayKlaims.length;

      return {
        label: format(day, 'dd MMM', { locale: id }),
        totalRefund,
        totalCount
      };
    });
  }
};
