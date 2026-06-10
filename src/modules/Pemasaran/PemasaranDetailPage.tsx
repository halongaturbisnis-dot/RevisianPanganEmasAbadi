import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { DetailShell } from '../../ui/components/common/shells/DetailShell';
import { pemasaranService, IPemasaranWithCustomer } from '../../logic/services/pemasaranService';
import { akunService } from '../../logic/services/akunService';
import { toast } from 'react-hot-toast';
import { MapPin, Globe, ExternalLink, User, Calendar, Tag, FileText, Image, UserCircle, ClipboardList, Mail, Briefcase } from 'lucide-react';
import { useGlobalState } from '../../logic/context/GlobalContext';
import { cn } from '../../logic/utils/cn';
import { formatDateFull } from '../../logic/utils/date';
import { swalConfig, toast as swalToast } from '../../logic/utils/swalConfig';
import { PhoneDisplay } from '../../ui/components/elements/PhoneDisplay';
import { MapViewer } from '../../ui/components/elements/MapViewer';
import { AuditTrail } from '../../ui/components/elements/AuditTrail';
import { AttachmentDisplay } from '../../ui/components/elements/AttachmentDisplay';

export const PemasaranDetailPage: React.FC = () => {
  const { state } = useGlobalState();
  const isMobile = state.viewport.isMobile;
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const referrer = searchParams.get('referrer');

  const [data, setData] = useState<IPemasaranWithCustomer | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const currentSession = akunService.getCurrentSession();
  const currentUserId = currentSession?.user_id;
  const isCreator = data?.created_by === currentUserId;

  useEffect(() => {
    if (id) {
      loadData(id);
    }
  }, [id]);

  const loadData = async (visitId: string) => {
    setIsLoading(true);
    try {
      const result = await pemasaranService.getById(visitId);
      if (result) {
        setData(result);
      } else {
        toast.error('Data kunjungan tidak ditemukan');
        navigate(referrer || '/pemasaran');
      }
    } catch (err) {
      toast.error('Gagal mengambil detail kunjungan pemasaran');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!data) return;
    
    swalConfig.fire({
      title: 'Hapus Kunjungan Pemasaran?',
      text: 'Data kunjungan serta foto bukti di cloud storage akan dihapus permanen!',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Ya, Hapus',
      cancelButtonText: 'Batal',
      confirmButtonColor: '#EF4444',
    }).then(async (result) => {
      if (result.isConfirmed) {
        const success = await pemasaranService.delete(data.id);
        if (success) {
          swalToast.fire({ icon: 'success', title: 'Data kunjungan pemasaran berhasil dihapus' });
          navigate(referrer || '/pemasaran');
        } else {
          swalToast.fire({ icon: 'error', title: 'Gagal menghapus data kunjungan' });
        }
      }
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-500"></div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-10">
        <p className="text-gray-400 italic">Data kunjungan tidak ditemukan</p>
      </div>
    );
  }

  return (
    <DetailShell
      id="pemasaran-detail-shell"
      title="Detail Laporan Kunjungan"
      onBack={() => navigate(referrer || '/pemasaran')}
      onEdit={isCreator ? () => navigate(`/pemasaran/edit/${data.id}${referrer ? `?referrer=${encodeURIComponent(referrer)}` : ''}`) : undefined}
      onDelete={isCreator ? handleDelete : undefined}
    >
      <div className="flex flex-col gap-4 sm:gap-6 w-full text-left pb-20">
        
        {/* Banner Header */}
        <div className="bg-gradient-to-r from-teal-500/10 to-teal-400/5 p-4 sm:p-6 rounded-xl border border-teal-500/10 shadow-sm flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between -mx-1 sm:mx-0">
          <div className="space-y-1.5 flex-1">
            <span className={cn(
              "px-3 py-1 rounded-full text-[10px] sm:text-xs font-bold inline-block uppercase shadow-sm tracking-wide",
              data.activity_type === 'client relation' ? "bg-blue-100 text-blue-700 border border-blue-200" :
              data.activity_type === 'selling' ? "bg-green-100 text-green-700 border border-green-200" :
              "bg-amber-100 text-amber-700 border border-amber-200"
            )}>
              {data.activity_type}
            </span>
            <h2 className="text-lg sm:text-2xl font-black text-gray-900 tracking-tight leading-tight line-clamp-2">
              Kunjungan: {data.customer_name}
            </h2>
            <p className="text-xs sm:text-sm text-gray-600 flex items-center gap-1.5 font-medium">
              <Calendar size={14} className="text-teal-600" />
              {formatDateFull(data.visit_date)}
            </p>
          </div>
        </div>

        <div className="space-y-4 sm:space-y-6 -mx-1 sm:mx-0">
          
          {/* Baris 1: Detil Pelanggan & Peta Customer */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
            
            {/* Card Pelanggan */}
            <div className="lg:col-span-2 bg-white p-4 sm:p-5 rounded-xl border border-gray-150 shadow-sm flex flex-col">
              <div className="flex items-center gap-2 border-b border-gray-100 pb-3 mb-4">
                <User size={18} className="text-teal-600" />
                <h3 className="font-bold text-gray-900 text-sm uppercase tracking-wide">Data Pelanggan</h3>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm font-medium flex-1 content-start">
                <div className="flex flex-col gap-1">
                  <span className="text-gray-500 text-xs flex items-center gap-1"><Briefcase size={12}/> Perusahaan</span>
                  <span className="text-gray-900">{data.customer_company || '-'}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-gray-500 text-xs flex items-center gap-1"><Tag size={12}/> Bidang Usaha</span>
                  <span className="text-gray-900">{data.customer_bidang_usaha || '-'}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-gray-500 text-xs flex items-center gap-1"><PhoneDisplay value="" className="w-0 h-0 invisible" /> Telepon</span>
                  <PhoneDisplay value={data.customer_telepon || ''} />
                </div>
                <div className="flex flex-col gap-1 overflow-hidden">
                  <span className="text-gray-500 text-xs flex items-center gap-1"><Mail size={12}/> Email</span>
                  <span className="text-gray-900 truncate">{data.customer_email || '-'}</span>
                </div>
                <div className="flex flex-col gap-1 sm:col-span-2">
                  <span className="text-gray-500 text-xs flex items-center gap-1"><MapPin size={12}/> Alamat</span>
                  <span className="text-gray-700 leading-relaxed font-normal">{data.customer_alamat || '-'}</span>
                </div>
              </div>
            </div>

            {/* Lokasi Customer */}
            <div className="bg-white p-4 sm:p-5 rounded-xl border border-gray-150 shadow-sm flex flex-col h-full min-h-[16rem]">
              <div className="flex items-center gap-2 border-b border-gray-100 pb-3 mb-4 shrink-0">
                <Globe size={18} className="text-blue-500" />
                <h3 className="font-bold text-gray-900 text-sm uppercase tracking-wide">Lokasi Customer</h3>
              </div>
              
              <div className="rounded-lg overflow-hidden border border-gray-200 flex-1 z-10 w-full relative min-h-[12rem]">
                <MapViewer
                  id="pemasaran-detail-customer-map"
                  latlong={data.customer_latlong || '-6.2088,106.8456'}
                  label={data.customer_name}
                  className="w-full h-full !border-none absolute inset-0"
                  height="100%"
                />
              </div>
            </div>
            
          </div>

          {/* Baris 2: Hasil Kunjungan & Titik Kunjungan */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">

            {/* Card Hasil Kunjungan */}
            <div className="lg:col-span-2 bg-white p-4 sm:p-5 rounded-xl border border-gray-150 shadow-sm flex flex-col">
              <div className="flex items-center gap-2 border-b border-gray-100 pb-3 mb-4 shrink-0">
                <ClipboardList size={18} className="text-teal-600" />
                <h3 className="font-bold text-gray-900 text-sm uppercase tracking-wide">Notulen & Lampiran</h3>
              </div>
              
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-sm text-gray-800 leading-relaxed font-medium whitespace-pre-line min-h-[5rem] mb-4">
                {data.description || <span className="text-gray-400 italic font-normal">Tidak ada deskripsi hasil kunjungan</span>}
              </div>

              <div className="mt-auto">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1">
                  <Image size={14} /> Foto / Bukti Kunjungan
                </span>
                <AttachmentDisplay 
                  files={data.proof_url ? [{ url: data.proof_url }] : []}
                  emptyText="Tidak ada berkas lampiran"
                  className="mt-1"
                />
              </div>
            </div>

            {/* Titik Kunjungan (Aktual) */}
            <div className="bg-white p-4 sm:p-5 rounded-xl border border-gray-150 shadow-sm flex flex-col h-full min-h-[16rem]">
              <div className="flex items-center gap-2 border-b border-gray-100 pb-3 mb-4 shrink-0">
                <MapPin size={18} className="text-rose-500" />
                <h3 className="font-bold text-gray-900 text-sm uppercase tracking-wide">Titik Kunjungan</h3>
              </div>
              
              <div className="rounded-lg overflow-hidden border border-gray-200 flex-1 z-10 w-full relative min-h-[10rem]">
                <MapViewer
                  id="pemasaran-detail-visit-map"
                  latlong={data.latlong_visiting}
                  label="Titik Kunjungan Lapangan"
                  className="w-full h-full !border-none absolute inset-0"
                  height="100%"
                />
              </div>
              <div className="mt-4 shrink-0 text-[13px] text-gray-700 font-medium leading-relaxed bg-rose-50/50 p-3 rounded-lg border border-rose-100 line-clamp-3">
                {data.alamat}
              </div>
            </div>

          </div>
        </div>

        {/* Audit Trails */}
        <div className="flex justify-end p-2 opacity-70 hover:opacity-100 transition-opacity mt-4">
          <AuditTrail 
            createdAt={data.created_at}
            createdBy={data.created_by}
            createdTimezone={data.created_timezone}
            updatedAt={data.updated_at}
            updatedBy={data.updated_by}
            updatedTimezone={data.updated_timezone}
            id="pemasaran-detail-audit-trail"
          />
        </div>

      </div>
    </DetailShell>
  );
};

export default PemasaranDetailPage;
