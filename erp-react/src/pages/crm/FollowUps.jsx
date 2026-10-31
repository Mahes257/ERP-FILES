import { useMemo, useRef, useState } from 'react';
import {
  PhoneCall, CalendarDays, CalendarClock, AlertTriangle, CheckCircle, Flag,
  History, Eye, Pencil, Users, Archive, RotateCcw, Trash2, Loader2, ExternalLink
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import CrmErpList from '../../components/CRM/CrmErpList';
import FollowUpHistoryDropdown from '../../components/CRM/FollowUpHistoryDropdown';
import { FollowUpViewModal } from '../../components/FollowUpDetail';
import { LeadViewModal } from '../../components/LeadDetail';
import { ClientViewModal } from '../../components/ClientDetail';
import { ConfirmDialog, FormField, Modal, TextInput, useToast } from '../../components/Common';
import leadService from '../../services/leadService';
import followUpService from '../../services/followUpService';
import { STAGE_BY_VALUE } from '../../utils/leadConstants';
import { getEnabledOptions, useDropdownVersion } from '../../utils/dropdownManager';
import { formatDate, formatTime, formatLeadNo, todayISO } from '../../utils/leadHelpers';
import { notesDisplayText } from '../../utils/leadNotes';

/**
 * Remarks cell text. Legacy CRM rows stored a {"__crmMeta":{…}} envelope in the
 * follow-up's discussion summary; the column shows the written remark only and
 * never the raw metadata (same parser as Lead Detail → Other Information).
 */
const remarksText = (value) => notesDisplayText(value) || '—';

// ERP followups.html table columns (Date → Actions)
// NOTE: there is deliberately NO Remarks column. The remark text is still
// stored, still editable in the Follow-up form, and still shown in the
// Follow-up History modal / detail views — it is only absent from this list
// grid. `REMOVED_COLUMN_KEYS` retires the key for users whose saved column
// configuration (MySQL grid config) predates the removal.
const FOLLOWUP_COLUMNS = [
  { key: 'leadNo', label: 'Lead / Client No', sortable: true, sortField: 'id' },
  { key: 'customer', label: 'Customer', sortable: true, sortField: 'name' },
  { key: 'stage', label: 'Lead Stage', sortable: true, sortField: 'stage' },
  { key: 'date', label: 'Date', sortable: true, sortField: 'date' },
  { key: 'time', label: 'Time' },
  { key: 'lastFollowup', label: 'Last Follow-up' },
  { key: 'mode', label: 'Mode' },
  { key: 'priority', label: 'Priority' },
  { key: 'status', label: 'Status', sortable: true, sortField: 'status' },
  { key: 'actions', label: 'Actions' }
];

/** Column keys retired from this list — pruned from saved configurations too. */
const REMOVED_COLUMN_KEYS = ['remarks'];

// Follow-up lifecycle statuses (the real followups table status column).
const STATUS_BADGE = {
  Open: 'crm-erp-status crm-erp-status-active',
  Pending: 'crm-erp-status crm-erp-status-active',
  'In Progress': 'crm-erp-status crm-erp-status-active',
  Completed: 'crm-erp-status crm-erp-status-inactive',
  Missed: 'crm-erp-status crm-erp-status-inactive',
  Cancelled: 'crm-erp-status crm-erp-status-inactive',
  Rescheduled: 'crm-erp-status crm-erp-status-inactive',
  Archived: 'crm-erp-status crm-erp-status-archived'
};

export default function FollowUps({ embedded = false }) {
  const toast = useToast();
  // Row actions open the full Follow-up View page (see onRowAction → 'viewDetails').
  const navigate = useNavigate();
  // Holds the list-refresh function passed by CrmErpList for custom mutations.
  const refreshRef = useRef(null);
  // View Details modal + Related Lead / Client modal state.
  const [viewFollowUpId, setViewFollowUpId] = useState(null);
  const [viewLead, setViewLead] = useState(null);
  const [viewClient, setViewClient] = useState(null);
  // Mark Completed confirm dialog.
  const [completeRow, setCompleteRow] = useState(null);
  const [completing, setCompleting] = useState(false);
  // Reschedule modal.
  const [rescheduleRow, setRescheduleRow] = useState(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduling, setRescheduling] = useState(false);
  // Follow-up History modal (all follow-ups for the row's Lead/Client).
  const [historyRow, setHistoryRow] = useState(null);
  const [historyRecords, setHistoryRecords] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const renderers = useMemo(
    () => ({
      // The row carries the real lead FK (leadId), not a document number —
      // derive the same LEAD-000000 number the Leads module shows. Without
      // this the cell fell through to row.leadNo (undefined) and rendered “—”.
      leadNo: (row) => (
        <span className="crm-erp-cell-main">
          {row.leadId != null
            ? formatLeadNo(row.leadId)
            : row.clientId != null
              ? `Client #${row.clientId}`
              : '—'}
        </span>
      ),
      date: (row) => <span>{formatDate(row.followupDate) || formatDate(row.date) || '—'}</span>,
      time: (row) => <span className="crm-erp-cell-muted">{formatTime(row.time) || '—'}</span>,
      customer: (row) => (
        <span className="crm-erp-cell-main">{row.companyName || row.leadName || row.businessName || row.name || '—'}</span>
      ),
      stage: (row) => {
        const value = row.leadStage || row.stage || '';
        const chip = STAGE_BY_VALUE[value]?.chip || 'bg-slate-100 text-slate-600 border border-slate-200';
        return (
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${chip}`}>
            {value || '—'}
          </span>
        );
      },
      // ERP semantics: "Last Follow-up" = the MOST RECENT follow-up date for
      // the same Lead/Client (computed by the backend across the whole history),
      // while the Date column keeps each record's own original date. The cell is
      // a dropdown that opens the real persisted history for this Lead/Client
      // (Date / Time / Remarks, newest first).
      lastFollowup: (row) => <FollowUpHistoryDropdown row={row} />,
      mode: (row) => <span className="crm-erp-cell-muted">{row.mode || '—'}</span>,
      priority: (row) => <span className="crm-erp-cell-muted">{row.priority || '—'}</span>,
      status: (row) => (
        <span className={STATUS_BADGE[row.status] || 'crm-erp-status'}>{row.status || 'Open'}</span>
      )
    }),
    []
  );

  // ---- ERP Actions menu — exact sections, wording and order ----
  const getRowActions = (row) => {
    if (row.status === 'Archived') {
      // ERP followups.js: archived rows show only Restore + Delete (moves to
      // trash; Permanent Delete lives in the Deleted tab).
      return [
        { key: 'restore', label: 'Restore', icon: RotateCcw },
        { key: 'delete', label: 'Delete', icon: Trash2, danger: true }
      ];
    }
    const items = [
      { section: 'FOLLOW-UP' },
      { key: 'viewDetails', label: 'View Details', icon: Eye },
      { key: 'openInNewTab', label: 'Open in New Tab', icon: ExternalLink },
      { key: 'edit', label: 'Edit', icon: Pencil }
    ];
    // ERP followups.js: Mark Completed / Reschedule are hidden once the
    // follow-up is Completed or Cancelled.
    if (row.status !== 'Completed' && row.status !== 'Cancelled') {
      items.push(
        { key: 'markCompleted', label: 'Mark Completed', icon: CheckCircle },
        { key: 'reschedule', label: 'Reschedule', icon: CalendarClock }
      );
    }
    items.push(
      { section: 'RELATED' },
      { key: 'relatedLead', label: 'Related Lead / Client', icon: Users },
      { key: 'followUpHistory', label: 'Follow-up History', icon: History },
      { section: 'ACTIONS' },
      { key: 'archive', label: 'Archive', icon: Archive },
      { key: 'delete', label: 'Delete', icon: Trash2, danger: true }
    );
    return items;
  };

  // Rebuild a full FollowUpRequest payload from a loaded FollowUpResponse so a
  // status/date-only update (Mark Completed / Reschedule) preserves every field.
  const buildUpdatePayload = (f, overrides = {}) => ({
    leadId: f.leadId != null ? f.leadId : null,
    leadName: f.leadName || '',
    companyName: f.companyName || '',
    contactPerson: f.contactPerson || '',
    phone: f.phone || '',
    email: f.email || '',
    leadStage: f.leadStage || '',
    source: f.source || '',
    industry: f.industry || '',
    executive: f.executive || '',
    address: f.address || '',
    // Dates: send null (not '') for optional LocalDate fields so Jackson's
    // deserializer never has to parse an empty string; the required date falls
    // back to today for legacy rows missing one.
    followupDate: f.followupDate ? String(f.followupDate).slice(0, 10) : todayISO(),
    time: f.time || '',
    mode: f.mode || '',
    priority: f.priority || '',
    currentStatus: f.currentStatus || '',
    outcome: f.outcome || '',
    discussionSummary: f.discussionSummary || '',
    customerFeedback: f.customerFeedback || '',
    requirement: f.requirement || '',
    nextFollowupDate: f.nextFollowupDate ? String(f.nextFollowupDate).slice(0, 10) : null,
    assignTo: f.assignTo || '',
    reminder: f.reminder || '',
    reminderType: f.reminderType || '',
    status: undefined,
    ...overrides
  });

  // Mark Completed — persists status='Completed' through the real /followups API.
  const handleMarkCompleted = async () => {
    if (!completeRow) return;
    setCompleting(true);
    try {
      const res = await followUpService.get(completeRow.id);
      const f = res?.data ?? res ?? {};
      await followUpService.update(completeRow.id, buildUpdatePayload(f, { status: 'Completed' }));
      toast.success('Follow-up marked as completed');
      setCompleteRow(null);
      refreshRef.current?.();
    } catch (err) {
      toast.error(err?.message || 'Failed to mark follow-up as completed');
    } finally {
      setCompleting(false);
    }
  };

  // Reschedule — updates the date and persists status='Rescheduled' (the ERP
  // also records previousDate; the followups table here has no such column).
  const handleReschedule = async () => {
    if (!rescheduleRow) return;
    const newDate = String(rescheduleDate || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
      toast.error('Please select a valid new follow-up date');
      return;
    }
    setRescheduling(true);
    try {
      const res = await followUpService.get(rescheduleRow.id);
      const f = res?.data ?? res ?? {};
      await followUpService.update(
        rescheduleRow.id,
        buildUpdatePayload(f, { followupDate: newDate, nextFollowupDate: newDate, status: 'Rescheduled' })
      );
      toast.success(`Follow-up rescheduled to ${formatDate(newDate)}`);
      setRescheduleRow(null);
      refreshRef.current?.();
    } catch (err) {
      toast.error(err?.message || 'Failed to reschedule follow-up');
    } finally {
      setRescheduling(false);
    }
  };

  // Custom menu actions. `refresh` (3rd arg) reloads the list from CrmErpList
  // after a mutation so the new status/date is reflected immediately.
  const onRowAction = (actionKey, row, refreshList) => {
    // Store the latest refresh so the confirm/modal handlers can reload the list.
    refreshRef.current = refreshList;
    switch (actionKey) {
      case 'viewDetails':
        // Navigate to the full Follow-up View page instead of opening the modal.
        navigate(`/followups/${row.id}`);
        break;
      case 'markCompleted':
        setCompleteRow(row);
        break;
      case 'reschedule':
        setRescheduleRow(row);
        setRescheduleDate(String(row.nextFollowupDate || row.followupDate || '').slice(0, 10));
        break;
      case 'followUpHistory':
        // Load the full history for this row's Lead/Client (newest first).
        setHistoryRow(row);
        setHistoryRecords(null);
        setHistoryLoading(true);
        followUpService
          .history(row.leadId, row.clientId)
          .then((res) => setHistoryRecords(res?.data ?? res ?? []))
          .catch(() => toast.error('Could not load follow-up history'))
          .finally(() => setHistoryLoading(false));
        break;
      case 'relatedLead':
        // ERP parity: follow-ups carry a Lead and/or a Client relationship.
        if (row.clientId != null) {
          setViewClient(row.clientId);
          break;
        }
        if (row.leadId == null) {
          toast.error('No linked lead or client for this follow-up');
          break;
        }
        leadService
          .getLead(row.leadId)
          .then((res) => setViewLead(res?.data ?? res ?? null))
          .catch(() => toast.error('Could not load the linked lead'));
        break;
      default:
        break;
    }
  };

  // ERP follow-up KPI cards — computed from the live API dataset.
  const getKpis = ({ rows, totalCount, statusCounts = {}, setFilter, setClientFilter }) => {
    const today = todayISO();
    // Row dates — the real followupDate field (consistent with the API dateFrom/dateTo filters).
    const day = (r) => (r.followupDate || r.date || '').slice(0, 10);
    const todayCount = rows.filter((r) => day(r) === today).length;
    const upcomingCount = rows.filter((r) => {
      const d = day(r);
      return Boolean(d) && d > today;
    }).length;
    const overdueCount = rows.filter((r) => {
      const d = day(r);
      return Boolean(d) && d < today;
    }).length;

    const clearFilters = () => {
      setClientFilter('status', '');
      // The lifecycle status is a real backend filter (/followups?status=…);
      // the Open/Completed KPI cards set it below, so a clear must reset it too.
      setFilter('status', '');
      setFilter('stage', '');
      setFilter('priority', '');
      setFilter('dateFrom', '');
      setFilter('dateTo', '');
    };

    return [
      { key: 'total', label: 'Total Follow-ups', value: totalCount, icon: PhoneCall, color: '#0B4A3D', onClick: clearFilters, newTabUrl: '/followups' },
      // Lifecycle status is a real backend filter — use setFilter('status') (the
      // /followups?status= param) rather than the client-side date-bucket filter
      // so Open/Completed actually narrow the query to those records.
      { key: 'open', label: 'Open', value: statusCounts['Open'] ?? rows.filter((r) => String(r.status || '').toLowerCase() === 'open').length, icon: CalendarDays, color: '#0B4A3D', onClick: () => { clearFilters(); setFilter('status', 'Open'); }, newTabUrl: '/followups?status=Open' },
      { key: 'today', label: "Today's Follow-ups", value: todayCount, icon: CalendarDays, color: '#0B4A3D', onClick: () => { clearFilters(); setFilter('dateFrom', today); setFilter('dateTo', today); }, newTabUrl: '/followups' },
      { key: 'upcoming', label: 'Upcoming', value: upcomingCount, icon: CalendarClock, color: '#10b981', onClick: clearFilters, newTabUrl: '/followups' },
      { key: 'overdue', label: 'Overdue', value: overdueCount, icon: AlertTriangle, color: '#ef4444', onClick: clearFilters, newTabUrl: '/followups' },
      { key: 'completed', label: 'Completed', value: statusCounts['Completed'] ?? 0, icon: CheckCircle, color: '#059669', onClick: () => { clearFilters(); setFilter('status', 'Completed'); }, newTabUrl: '/followups?status=Completed' },
      // Counted from the loaded rows, like the Today/Upcoming/Overdue cards —
      // this was previously hardcoded to 0 and never matched the Priority column.
      { key: 'highpriority', label: 'High Priority', value: rows.filter((r) => String(r.priority || '').toLowerCase() === 'high').length, icon: Flag, color: '#d97706', onClick: clearFilters, newTabUrl: '/followups' }
    ];
  };

  useDropdownVersion();
  const managedStageFilterOptions = getEnabledOptions('lead_stage').map((o) => ({ value: o.value, label: o.value }));
  const managedPriorityFilterOptions = getEnabledOptions('fu_priority').map((o) => ({ value: o.value, label: o.value }));

  const FOLLOWUP_FILTERS = useMemo(
    () => [
      {
        // ERP followups.html “All Status— — date-bucket views (Today / Upcoming /
        // Overdue / Completed) applied client-side to the loaded rows. “Completed—
        // has no backend equivalent, so it honestly matches nothing.
        key: 'status', label: 'Status', type: 'select', mode: 'client',
        match: (row, value) => {
          const d = (row.followupDate || row.date || '').slice(0, 10);
          if (!d) return false;
          const today = todayISO();
          if (value === 'Today') return d === today;
          if (value === 'Upcoming') return d > today;
          if (value === 'Overdue') return d < today;
          if (value === 'Completed') return false; // no backend “completed— flag
          return false;
        },
        options: [
          { value: '', label: 'All Status' },
          { value: 'Today', label: 'Today' },
          { value: 'Upcoming', label: 'Upcoming' },
          { value: 'Overdue', label: 'Overdue' },
          { value: 'Completed', label: 'Completed' }
        ]
      },
      {
        // Priority maps to the real /followups?priority= server filter.
        key: 'priority', label: 'Priority', type: 'select',
        options: [{ value: '', label: 'All Priorities' }, ...managedPriorityFilterOptions]
      },
      {
        // ERP followups.html third filter — “All Stages— (lead stage). Maps to
        // the real /followups?stage= server filter.
        key: 'stage', label: 'Stage', type: 'select',
        options: [{ value: '', label: 'All Stages' }, ...managedStageFilterOptions]
      }
    ],
    [managedPriorityFilterOptions, managedStageFilterOptions]
  );

  return (
    <>
      <CrmErpList
        title="Follow-ups"
        titleIcon={PhoneCall}
        breadcrumb={['Dashboard', 'Sales', 'Follow-ups']}
        endpoint="followups"
        noun="follow-up"
        filename="followups"
        columns={FOLLOWUP_COLUMNS}
        excludeColumns={REMOVED_COLUMN_KEYS}
        renderers={renderers}
        filters={FOLLOWUP_FILTERS}
        kpis={getKpis}
        searchPlaceholder="Search by Lead No, Name, Remarks..."
        addButton={{ label: 'Add Follow-up', to: '/followups/new' }}
        emptyMessage="No follow-ups found matching your criteria."
        errorMessage="Failed to load follow-ups. Please try again."
        viewRoute={(row) => `/followups/${row.id}`}
        rowActions={getRowActions}
        onRowAction={onRowAction}
        embedded={embedded}
      />

      {/* View Details */}
      <FollowUpViewModal
        open={viewFollowUpId != null}
        followUpId={viewFollowUpId}
        onClose={() => setViewFollowUpId(null)}
        // Same related-record behavior as the list's "Related Lead" action:
        // open the real linked record's existing view.
        onOpenClient={(clientId) => {
          setViewFollowUpId(null);
          setViewClient(clientId);
        }}
        onOpenLead={(leadId) => {
          setViewFollowUpId(null);
          leadService
            .getLead(leadId)
            .then((res) => setViewLead(res?.data ?? res ?? null))
            .catch(() => toast.error('Could not load the linked lead'));
        }}
      />

      {/* Mark Completed (confirmed, like the ERP VT.Confirm flow) */}
      <ConfirmDialog
        open={completeRow !== null}
        title="Complete Follow-up"
        message={`Mark "${completeRow?.companyName || completeRow?.leadName || 'this follow-up'}" as completed?`}
        confirmLabel="Complete"
        variant="default"
        icon={CheckCircle}
        loading={completing}
        onConfirm={handleMarkCompleted}
        onCancel={() => setCompleteRow(null)}
      />

      {/* Reschedule */}
      <Modal
        open={rescheduleRow !== null}
        onClose={() => setRescheduleRow(null)}
        title="Reschedule Follow-up"
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            Pick a new date for the follow-up on{' '}
            <span className="font-bold text-slate-800">
              {rescheduleRow ? formatDate(rescheduleRow.followupDate) : '—'}
            </span>
            . Its status will be set to <span className="font-bold text-slate-800">Rescheduled</span>.
          </p>
          <FormField label="New Follow-up Date" required>
            <TextInput
              type="date"
              value={rescheduleDate}
              onChange={(e) => setRescheduleDate(e.target.value)}
            />
          </FormField>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setRescheduleRow(null)}
              disabled={rescheduling}
              className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-surface border border-slate-200 px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleReschedule}
              disabled={rescheduling}
              className="flex items-center gap-1.5 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-4 py-2 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {rescheduling && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Reschedule
            </button>
          </div>
        </div>
      </Modal>

      {/* Related Lead / Client — opens the linked record's existing view */}
      <LeadViewModal
        open={viewLead !== null}
        lead={viewLead}
        onClose={() => setViewLead(null)}
      />
      <ClientViewModal
        open={viewClient != null}
        clientId={viewClient}
        onClose={() => setViewClient(null)}
      />

      {/* Follow-up History — every follow-up for the selected Lead/Client, newest first */}
      <Modal
        open={historyRow !== null}
        onClose={() => setHistoryRow(null)}
        title="Follow-up History"
        maxWidth="max-w-4xl"
      >
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm border border-indigo-200 shrink-0">
              {(historyRow?.companyName || historyRow?.leadName || 'F').slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-slate-900 truncate">
                {historyRow?.companyName || historyRow?.leadName || 'Lead / Client'}
              </div>
              <div className="text-[11px] text-slate-400 font-medium truncate">
                {historyRow?.leadId != null
                  ? `#${String(historyRow.leadId).padStart(4, '0')}`
                  : historyRow?.clientId != null
                    ? `Client #${historyRow.clientId}`
                    : '—'}
                {historyRecords?.length ? ` · ${historyRecords.length} follow-up${historyRecords.length === 1 ? '' : 's'}` : ''}
              </div>
            </div>
          </div>

          <div className="crm-erp-table-card">
            <div className="crm-erp-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Follow-up Date</th>
                    <th>Time</th>
                    <th>Lead / Client No</th>
                    <th>Customer</th>
                    <th>Mode</th>
                    <th>Remarks</th>
                    <th>Status</th>
                    <th>Priority</th>
                    <th>Lead Stage</th>
                  </tr>
                </thead>
                <tbody>
                  {historyLoading ? (
                    <tr>
                      <td colSpan={9} className="crm-erp-cell-muted">
                        <div className="flex items-center gap-2 py-4 justify-center">
                          <Loader2 className="w-4 h-4 animate-spin text-[#0B4A3D]" />
                          Loading history...
                        </div>
                      </td>
                    </tr>
                  ) : historyRecords && historyRecords.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="crm-erp-cell-muted">
                        <div className="py-4 text-center">No follow-ups found for this lead / client.</div>
                      </td>
                    </tr>
                  ) : (historyRecords || []).map((h) => (
                    <tr key={h.id}>
                      <td className="crm-erp-cell-main">{formatDate(h.followupDate) || '—'}</td>
                      <td className="crm-erp-cell-muted">{formatTime(h.time) || '—'}</td>
                      <td className="crm-erp-cell-main">{`#${String(h.leadId ?? h.id).padStart(4, '0')}`}</td>
                      <td className="crm-erp-cell-main">{h.companyName || h.leadName || '—'}</td>
                      <td className="crm-erp-cell-muted">{h.mode || '—'}</td>
                      <td className="crm-erp-cell-muted" title={remarksText(h.discussionSummary)}>{remarksText(h.discussionSummary)}</td>
                      <td>
                        <span className={STATUS_BADGE[h.status] || 'crm-erp-status'}>{h.status || 'Open'}</span>
                      </td>
                      <td className="crm-erp-cell-muted">{h.priority || '—'}</td>
                      <td className="crm-erp-cell-muted">{h.leadStage || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}
