import { useState } from 'react';
import {
  History as HistoryIcon, Activity as ActivityIcon, StickyNote, Paperclip, ListOrdered,
  IdCard
} from 'lucide-react';
import { Modal, Tabs } from '../Common';
import { STAGE_BY_VALUE } from '../../utils/leadConstants';
import { formatINR, formatDate, formatLeadNo, getInitials, avatarColor } from '../../utils/leadHelpers';
import Timeline from './Timeline';
import Activities from './Activities';
import Notes from './Notes';
import Attachments from './Attachments';
import HistoryTab from './History';
import LeadDetailsTab from './LeadDetailsTab';

const TABS = [
  { key: 'details', label: 'Lead Details', icon: IdCard },
  { key: 'timeline', label: 'Timeline', icon: HistoryIcon },
  { key: 'activities', label: 'Activities', icon: ActivityIcon },
  { key: 'notes', label: 'Notes', icon: StickyNote },
  { key: 'attachments', label: 'Attachments', icon: Paperclip },
  { key: 'history', label: 'History', icon: ListOrdered }
];

const ACTIVE_TABS = {
  timeline: Timeline,
  activities: Activities,
  notes: Notes,
  attachments: Attachments,
  history: HistoryTab
};


export default function LeadViewModal({ open, lead, onClose }) {
  const [activeTab, setActiveTab] = useState('details');

  if (!lead) return null;

  const ActiveComponent = ACTIVE_TABS[activeTab];
  const fallbackKey = {
    timeline: 'timeline',
    activities: 'activities',
    notes: 'notes',
    attachments: 'attachments',
    history: 'history'
  }[activeTab];

  return (
    <Modal open={open} onClose={onClose} title="Lead Details" maxWidth="max-w-4xl">
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm ${avatarColor(lead.name)} border border-black/5 shrink-0`}>
            {getInitials(lead.name)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-slate-900 truncate">
              {lead.leadNo || formatLeadNo(lead.id)}
              {lead.name ? <span className="text-slate-400 font-semibold"> · {lead.name}</span> : null}
            </div>
            <div className="text-[11px] text-slate-400 font-medium truncate">
              {[lead.company, lead.phone, lead.email].filter(Boolean).join(' · ') || '—'}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
              STAGE_BY_VALUE[lead.stage]?.chip || 'bg-slate-100 text-slate-600 border border-slate-200'
            }`}>
              {lead.stage}
            </span>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
              lead.status === 'Archived'
                ? 'bg-slate-100 text-slate-600 border border-slate-200'
                : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
            }`}>
              {lead.status || 'Active'}
            </span>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold text-slate-700 bg-slate-100 border border-slate-200">
              {formatINR(lead.value)}
            </span>
          </div>
        </div>

        <div className="text-[11px] text-slate-400 font-medium flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 pt-3">
          {lead.owner && <span>Owner: <span className="text-slate-600 font-bold">{lead.owner}</span></span>}
          {lead.source && <span>Source: <span className="text-slate-600 font-bold">{lead.source}</span></span>}
          {lead.date && <span>Registered: <span className="text-slate-600 font-bold">{formatDate(lead.date)}</span></span>}
        </div>

        <Tabs tabs={TABS} activeKey={activeTab} onChange={setActiveTab} />

        <div className="pt-2 pb-1">
          {activeTab === 'details' ? (
            <LeadDetailsTab lead={lead} />
          ) : ActiveComponent ? (
            <ActiveComponent key={`${lead.id}-${activeTab}`} leadId={lead.id} fallbackData={lead[fallbackKey]} />
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
