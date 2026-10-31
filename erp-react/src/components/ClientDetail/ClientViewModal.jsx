import { useState } from 'react';
import {
  IdCard, Clock, FolderOpen, BookOpen, Activity as ActivityIcon, GitBranch, Loader2
} from 'lucide-react';
import { Modal, Tabs } from '../Common';
import customerService from '../../services/customerService';
import useAsyncData from '../../hooks/useAsyncData';
import { formatINR } from '../../utils/leadHelpers';
import {
  ClientDetailsTab,
  ClientTimelineTab,
  ClientDocumentsTab,
  ClientStatementTab,
  ClientActivitiesTab,
  ClientVersionHistoryTab
} from './ClientTabs';

const TABS = [
  { key: 'details', label: 'Client Details', icon: IdCard },
  { key: 'timeline', label: 'Timeline', icon: Clock },
  { key: 'documents', label: 'Documents', icon: FolderOpen },
  { key: 'statement', label: 'Statement', icon: BookOpen },
  { key: 'activities', label: 'Activities', icon: ActivityIcon },
  { key: 'versionHistory', label: 'Version History', icon: GitBranch }
];

export default function ClientViewModal({ open, clientId, initialTab = 'details', onClose }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const { data: customerResponse, loading } = useAsyncData(
    () => (open && clientId != null ? customerService.get(clientId) : Promise.resolve(null)),
    { deps: [open, clientId] }
  );

  // GET /customers/{id} returns {success, message, data}; the record lives in
  // `data`. Without this unwrap every field below renders as "—".
  const customer = customerResponse && typeof customerResponse === 'object' && !Array.isArray(customerResponse)
    ? customerResponse.data ?? customerResponse
    : null;

  const displayName = customer?.businessName || customer?.alias || customer?.contactPerson || 'Client';
  const code = customer?.clientCode || (clientId != null ? `CLI-${String(clientId).padStart(6, '0')}` : '');

  return (
    <Modal open={open} onClose={onClose} title="Client Details" maxWidth="max-w-4xl">
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-sm border border-emerald-200 shrink-0">
            {(displayName || '?').slice(0, 1).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-slate-900 truncate">{displayName}</div>
            <div className="text-[11px] text-slate-400 font-medium truncate">
              {[code, customer?.contactPerson, customer?.phone, customer?.email].filter(Boolean).join(' · ') || '—'}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
              customer?.status === 'Archived'
                ? 'bg-slate-100 text-slate-600 border border-slate-200'
                : customer?.status === 'Inactive'
                  ? 'bg-amber-50 text-amber-700 border border-amber-100'
                  : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
            }`}>
              {customer?.status || 'Active'}
            </span>
            {customer?.openingBalance != null && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold text-slate-700 bg-slate-100 border border-slate-200">
                {formatINR(customer.openingBalance, customer.currency)}
              </span>
            )}
          </div>
        </div>

        <Tabs tabs={TABS} activeKey={activeTab} onChange={setActiveTab} />

        <div className="pt-2 pb-1">
          {loading || !customer ? (
            <div className="py-8 text-center text-xs font-semibold text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin mx-auto mb-2" /> Loading client…
            </div>
          ) : (
            <>
              {activeTab === 'details' && <ClientDetailsTab customer={customer} />}
              {activeTab === 'timeline' && <ClientTimelineTab clientId={clientId} />}
              {activeTab === 'documents' && <ClientDocumentsTab clientId={clientId} />}
              {activeTab === 'statement' && <ClientStatementTab clientId={clientId} currency={customer?.currency} />}
              {activeTab === 'activities' && <ClientActivitiesTab clientId={clientId} />}
              {activeTab === 'versionHistory' && <ClientVersionHistoryTab clientId={clientId} client={customer} />}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
