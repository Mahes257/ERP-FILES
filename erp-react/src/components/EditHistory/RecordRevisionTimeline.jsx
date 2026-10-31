import { useEffect, useState } from 'react';
import { GitBranch, ChevronDown, Loader2 } from 'lucide-react';
import api from '../../api/axiosInstance';
import { formatDateTime } from '../../utils/leadHelpers';

/**
 * Renders the saved version history of a CRM record (Customer / Lead /
 * Follow-up). Every edit writes an immutable full-state snapshot into the
 * `record_revisions` table — the master record keeps its id, so the history
 * below is the permanently-preserved record of every edit.
 *
 * Fetches from GET /record-revisions/{module}/{recordId}, newest first.
 */
export default function RecordRevisionTimeline({ module, recordId, limit = 25 }) {
  const [revisions, setRevisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(() => new Set());

  useEffect(() => {
    if (recordId == null) return undefined;
    let cancelled = false;
    api
      .get(`/record-revisions/${module}/${recordId}`)
      .then((res) => {
        if (cancelled) return;
        const body = res?.data;
        const list = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
        setRevisions(list.slice().reverse());
        if (list.length > 0) setExpanded(new Set([list.length])); // newest (largest version) expanded
      })
      .catch(() => {
        if (!cancelled) setRevisions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [module, recordId]);

  if (recordId == null) {
    return null;
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-400 py-3">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading version history…
      </div>
    );
  }

  if (revisions.length === 0) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-400 py-3">
        <GitBranch className="w-3.5 h-3.5" /> No version history yet — the record has never been edited.
      </div>
    );
  }

  const visible = revisions.slice(0, limit);

  const toggle = (version) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(version)) next.delete(version);
      else next.add(version);
      return next;
    });
  };

  const LABELS = {
    name: 'Name',
    businessName: 'Business Name',
    contactPerson: 'Contact Person',
    phone: 'Phone',
    email: 'Email',
    address: 'Address',
    industry: 'Industry',
    source: 'Lead Source',
    stage: 'Stage',
    owner: 'Owner',
    priority: 'Priority',
    expectedValue: 'Expected Value',
    value: 'Expected Value',
    status: 'Status',
    followUpDate: 'Follow-up Date',
    remarks: 'Remarks',
    mode: 'Mode',
    leadId: 'Lead',
    clientId: 'Client',
    assignedTo: 'Assigned To'
  };

  const labelFor = (key) => LABELS[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());

  return (
    <div className="space-y-2">
      {visible.map((rev) => {
        const fields = rev.fields && typeof rev.fields === 'object' ? Object.entries(rev.fields) : [];
        const isOpen = expanded.has(rev.version);
        return (
          <div key={rev.id} className="border border-slate-200 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => toggle(rev.version)}
              className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer text-left"
            >
              <div className="flex items-center gap-2 min-w-0">
                <GitBranch className="w-3.5 h-3.5 text-[#0B4A3D] shrink-0" />
                <span className="text-xs font-bold text-slate-700">Version {rev.version}</span>
                <span className="text-[11px] text-slate-400 font-medium truncate">
                  {rev.changedBy || 'System'} · {rev.createdAt ? formatDateTime(rev.createdAt) : '—'}
                </span>
              </div>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
              <div className="px-3.5 py-2.5 border-t border-slate-100">
                {fields.length === 0 ? (
                  <div className="text-xs text-slate-400">No field-level details recorded.</div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
                    {fields.map(([key, value]) => (
                      <div key={key} className="flex items-baseline gap-2 text-xs">
                        <span className="text-slate-400 font-medium shrink-0">{labelFor(key)}</span>
                        <span className="text-slate-700 font-medium truncate" title={value}>
                          {value != null && value !== '' ? value : '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
