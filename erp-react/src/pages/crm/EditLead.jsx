import { useState, useEffect } from 'react';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import LeadForm from '../../components/LeadForm';
import { useToast } from '../../components/Common';
import leadService from '../../services/leadService';
import { buildLeadFormPrefill } from '../../utils/leadHelpers';

export default function EditLead() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [initialData, setInitialData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const data = await leadService.getLead(id);
        if (cancelled) return;
        // GET /leads/{id} returns ApiResponse{ success, message, data } — unwrap
        // the envelope so the form hydrates with the real saved values.
        const leadData = data?.data ?? data;
        setInitialData(buildLeadFormPrefill(leadData));
      } catch (err) {
        if (cancelled) return;
        toast.error(err?.message || 'Failed to load lead');
        navigate('/leads');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [id, navigate, toast]);

  return (
    <div className="flex-1 bg-app font-sans antialiased text-slate-800 p-4 sm:p-6 w-full max-w-[100vw] overflow-x-hidden">

      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 mb-3 select-none">
        <span>VISHAK TECH</span>
        <span>&gt;</span>
        <span>CRM</span>
        <span>&gt;</span>
        <span>Leads</span>
        <span>&gt;</span>
        <span className="text-slate-600">Edit Lead</span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Edit Lead</h1>
          <p className="text-xs text-slate-400 font-medium mt-1">Update the details of this business lead.</p>
        </div>
        <button
          onClick={() => navigate('/leads')}
          className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-surface border border-slate-200 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer select-none w-fit"
        >
          <ChevronLeft className="w-3.5 h-3.5 text-slate-400" /> Back to Leads
        </button>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[0, 1, 2].map((item) => (
            <div key={item} className="bg-surface border border-slate-200 rounded-xl shadow-sm p-4 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-200 animate-pulse" />
              <div className="h-4 w-48 bg-slate-200 rounded animate-pulse" />
            </div>
          ))}
          <div className="flex items-center justify-center gap-2 text-xs font-semibold text-slate-400 py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading lead details...
          </div>
        </div>
      ) : (
        <LeadForm leadId={id} initialData={initialData} />
      )}

    </div>
  );
}
