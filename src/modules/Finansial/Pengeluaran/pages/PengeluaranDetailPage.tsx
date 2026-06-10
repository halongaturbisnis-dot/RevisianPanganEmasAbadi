import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { DetailShell } from '../../../../ui/components/common/shells/DetailShell';
import { pengeluaranService } from '../../../../logic/services/pengeluaranService';
import { bankAndCashService } from '../../../../logic/services/bankAndCashService';
import { IPengeluaran, IPengeluaranFile, TPengeluaranStatus } from '../../../../logic/types/ITs_Pengeluaran';
import { IBankAndCash } from '../../../../logic/types/ITs_BankAndCash';
import { toast } from 'react-hot-toast';
import { Badge } from '../../../../ui/components/elements/Badge';
import { Label } from '../../../../ui/components/elements/Label';
import { AuditTrail } from '../../../../ui/components/elements/AuditTrail';
import { cn } from '../../../../logic/utils/cn';
import { useGlobalState } from '../../../../logic/context/GlobalContext';
import { formatCurrency } from '../../../../logic/utils/data'; // Pastikan import ini ada
import { formatDateFull } from '../../../../logic/utils/date';
import { swalConfig, toast as swalToast } from '../../../../logic/utils/swalConfig';
import { tokens } from '../../../../ui/styles/tokens';
import { FileText, Download, Calendar, Wallet, Tag, CheckCircle, XCircle, File as FileIcon, Eye } from 'lucide-react';

/**
 * PENGELUARAN DETAIL PAGE (CLEAN DESIGN)
 * Desain ulang yang bersih, tanpa background hijau, dan lebih modern.
 */
export const PengeluaranDetailPage: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const referrer = searchParams.get('referrer');
  const [data, setData] = useState<IPengeluaran | null>(null);
  const [sourceBank, setSourceBank] = useState<IBankAndCash | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const { state } = useGlobalState();
  const isMobile = state.viewport.isMobile;

  useEffect(() => {
    loadDetail();
  }, [id]);

  const loadDetail = async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      const result = await pengeluaranService.getById(id);
      if (result) {
        setData(result);
        const bank = await bankAndCashService.getById(result.bank_and_cash_id);
        setSourceBank(bank);
      } else {
        toast.error('Data tidak ditemukan');
        navigate(referrer || '/finansial/pengeluaran');
      }
    } catch (error) {
      toast.error('Gagal memuat data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!id) return;

    swalConfig.fire({
      title: 'Hapus Pengeluaran?',
      text: 'Data dan bukti file yang dihapus tidak dapat dikembalikan!',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Ya, Hapus',
      cancelButtonText: 'Batal',
      confirmButtonColor: '#ef4444', // Merah untuk hapus
      cancelButtonColor: '#6b7280',
    }).then(async (result) => {
      if (result.isConfirmed) {
        const success = await pengeluaranService.delete(id);
        if (success) {
          swalToast.fire({ icon: 'success', title: 'Data berhasil dihapus' });
          navigate(referrer || '/finansial/pengeluaran');
        } else {
          swalToast.fire({ icon: 'error', title: 'Gagal menghapus data' });
        }
      }
    });
  };

  if (isLoading) return <div className="p-8 text-center text-gray-500">Memuat data...</div>;
  if (!data) return null;

  const proofFiles: IPengeluaranFile[] = JSON.parse(data.proof_urls || '[]');

  // Komponen Item Data yang Clean (Icon + Label + Value)
  const DataItem: React.FC<{ 
    label: string; 
    value: string | number; 
    icon?: React.ReactNode; 
    isCurrency?: boolean;
  }> = ({ label, value, icon, isCurrency }) => (
    <div className="flex flex-col gap-1">
      <span className="!text-FontSizeNano font-black text-TextColorBase opacity-80 uppercase !leading-none tracking-widest pl-SpacingNano border-l-2 border-ColorPrimary flex items-center gap-SpacingNano">
        {icon && <span className="text-gray-400">{icon}</span>}
        {label}
      </span>
      <div className="flex items-center h-10 px-0 bg-transparent border-b border-gray-100 text-sm text-gray-900 font-medium">
        {isCurrency && <span className="mr-1.5 text-TextColorBase">Rp</span>}
        {value}
      </div>
    </div>
  );

  return (
    <DetailShell
      id="pengeluaran-detail-shell"
      title="Detail Pengeluaran"
      subtitle="Informasi lengkap mengenai transaksi operasional."
      onBack={() => navigate(referrer || '/finansial/pengeluaran')}
    >
      <div className="flex flex-col gap-8 w-full max-w-5xl mx-auto pb-8 animate-in fade-in slide-in-from-bottom-2 duration-DurationMid">
        
        {/* CARD 1: INFORMASI UTAMA (GRID 4 KOLOM) */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
          <div className={cn("grid gap-8", isMobile ? "grid-cols-1" : "grid-cols-4")}>
            
            <DataItem 
              label="Tanggal" 
              value={formatDateFull(data.transaction_date)} 

            />

            <DataItem 
              label="Nominal" 
              value={data.amount.toLocaleString('id-ID')} 
              isCurrency 

            />

            <DataItem 
              label="Sumber Dana" 
              value={sourceBank ? sourceBank.nama_akun : '-'} 

            />

            <DataItem 
              label="Kategori" 
              value={data.type || '-'}
            />

          </div>
        </div>

        {/* CARD 2: DESKRIPSI & BUKTI (GRID 2 KOLOM) */}
        <div className={cn("grid gap-8", isMobile ? "grid-cols-1" : "grid-cols-2")}>
          
          {/* Kolom Kiri: Deskripsi */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 flex flex-col h-full">
            <div className="flex items-center gap-2 mb-6">
              <h3 className="!text-FontSizeNano font-black text-TextColorBase opacity-80 uppercase !leading-none tracking-widest pl-SpacingNano border-l-2 border-ColorPrimary flex items-center gap-SpacingNano">Deskripsi Transaksi</h3>
            </div>
            <div className="flex-1 p-0 bg-transparent text-sm text-gray-600 leading-relaxed whitespace-pre-wrap min-h-[100px]">
              {data.description || <span className="italic text-gray-400">Tidak ada deskripsi.</span>}
            </div>
          </div>

          {/* Kolom Kanan: Bukti */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 flex flex-col h-full">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <h3 className="!text-FontSizeNano font-black text-TextColorBase opacity-80 uppercase !leading-none tracking-widest pl-SpacingNano border-l-2 border-ColorPrimary flex items-center gap-SpacingNano">Bukti Pengeluaran</h3>
              </div>
              <span className="text-[10px] font-bold text-gray-400 bg-gray-50 px-2 py-1 rounded-full uppercase tracking-tighter">
                {proofFiles.length} Lampiran
              </span>
            </div>
            
            <div className="flex-1 flex flex-col">
              {proofFiles.length > 0 ? (
                <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-4 content-start">
                  {proofFiles.map((file, idx) => {
                    const isImage = file.url.includes('data:image') || (file.url.includes('http') && !file.url.toLowerCase().includes('.pdf') && !file.url.toLowerCase().includes('/pdf'));
                    return (
                      <a 
                        key={idx}
                        href={file.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="group relative aspect-square rounded-lg bg-gray-50/50 hover:bg-gray-100 transition-all duration-200 flex flex-col items-center justify-center overflow-hidden border-none shadow-sm hover:shadow-md"
                      >
                        {isImage ? (
                          <img src={file.url} alt={`Bukti ${idx + 1}`} className="w-full h-full object-cover" />
                        ) : (
                          <div className="flex flex-col items-center">
                            <FileIcon size={24} className="text-gray-400 group-hover:text-ColorPrimary mb-1 transition-colors" />
                            <span className="text-[8px] font-bold text-gray-400 group-hover:text-TextColorBase text-center px-1 line-clamp-1 w-full uppercase">
                               Berkas {idx + 1}
                            </span>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-Black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Eye size={18} className="text-White" />
                        </div>
                      </a>
                    );
                  })}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center rounded-lg bg-transparent text-gray-400 p-6 border-2 border-dashed border-gray-100">
                  <FileText size={32} className="mb-2 opacity-30" />
                  <p className="text-xs text-center italic opacity-70">Tidak ada lampiran bukti</p>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* AUDIT TRAIL */}
        <div className="opacity-80">
          <AuditTrail 
            createdAt={data.created_at}
            createdBy={data.created_by}
            createdTimezone={data.created_timezone}
            updatedAt={data.updated_at}
            updatedBy={data.updated_by}
            updatedTimezone={data.updated_timezone}
          />
        </div>

      </div>
    </DetailShell>
  );
};

export default PengeluaranDetailPage;