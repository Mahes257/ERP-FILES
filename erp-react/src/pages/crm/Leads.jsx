import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, Star, CheckCircle, FileText, Trophy, XCircle, Phone, AlertTriangle,
  Eye, Pencil, PhoneCall, Mail, StickyNote, Paperclip, TrendingUp, UserCheck, Flag,
  Download, UserPlus, ClipboardList, ClipboardSignature, Archive, RotateCcw, Trash2,
  Columns2, ExternalLink, ScanSearch
} from 'lucide-react';
import CrmErpList from '../../components/CRM/CrmErpList';
import { useToast, LastFollowupHistory, RecordPreviewModal } from '../../components/Common';
import { openInNewTab } from '../../utils/navigationHelpers';
import leadService from '../../services/leadService';
import {
  AssignOwnerModal, ChangeStageModal, ChangePriorityModal, AddNoteModal, UploadAttachmentModal,
  LogCallModal, SendEmailModal
} from '../../components/LeadModals';
import { STAGE_BY_VALUE } from '../../utils/leadConstants';
import { stageToApiLabel, useDropdownVersion } from '../../utils/dropdownManager';
import { getEffectiveEnabledOptions, useSettingsOptions } from '../../utils/settingsOptions';
import { formatINR, formatDate, nextFollowUpDate, todayISO } from '../../utils/leadHelpers';
import { exportCSV, exportPDFDetailed } from '../../utils/exportUtils';

// ERP leads.html table columns (Lead No → Actions)
// Shared with the Lead view page's Generate PDF / export actions.
//
// `width` is the ERPP-grid column width in px. CrmErpList renders these as a
// <colgroup> and makes the table's min-width their SUM (plus the selection
// column), so the Leads list is a deliberately wide grid that scrolls
// horizontally instead of squeezing every column into the viewport. The
// widths below are sized from the real values the Columns render (longest
// business name / email / contact measured at the cell font) plus the
// spacious cell padding — narrow enough to stay scannable, wide enough that
// ordinary values never wrap. `align` is honoured by both the header and the
// body cell (center for chip/date columns). Exports ignore width/align.
// eslint-disable-next-line react-refresh/only-export-components
export const LEAD_COLUMNS = [
  { key: 'leadNo', label: 'Lead No', width: 150, sortable: true, sortField: 'id' },
  { key: 'businessName', label: 'Business Name', width: 230, sortable: true, sortField: 'businessName' },
  { key: 'contactPerson', label: 'Contact Person', width: 200, sortable: true, sortField: 'name' },
  { key: 'phone', label: 'Phone', width: 150 },
  { key: 'email', label: 'Email', width: 230 },
  { key: 'industry', label: 'Industry', width: 170, sortable: true, sortField: 'industry' },
  { key: 'source', label: 'Lead Source', width: 150, sortable: true, sortField: 'source' },
  { key: 'stage', label: 'Stage', width: 150, align: 'center', sortable: true, sortField: 'stage' },
  { key: 'owner', label: 'Owner', width: 150, sortable: true, sortField: 'owner' },
  { key: 'priority', label: 'Priority', width: 130, align: 'center' },
  { key: 'expectedValue', label: 'Expected Value', width: 165, sortable: true, sortField: 'value', align: 'right' },
  { key: 'lastFollowup', label: 'Last Follow-up', width: 160, align: 'center' },
  { key: 'nextFollowup', label: 'Next Follow-up', width: 160, align: 'center' },
  { key: 'status', label: 'Status', width: 130, align: 'center', sortable: true, sortField: 'status' },
  { key: 'actions', label: 'Actions', width: 80 }
];

// Columns used by the single-lead Generate PDF / Export actions (no Actions col).
// Exported so the Lead view page reuses the exact same export layout.
// eslint-disable-next-line react-refresh/only-export-components
export const LEAD_EXPORT_COLUMNS = LEAD_COLUMNS.filter((c) => c.key !== 'actions');

const STATUS_BADGE = {
  Active: 'crm-erp-status crm-erp-status-active',
  Inactive: 'crm-erp-status crm-erp-status-inactive',
  Archived: 'crm-erp-status crm-erp-status-archived'
};

// ERP Actions menu sections (ERP leads.html three-dot menu) — exact order/wording.
const ACTIONS_SECTIONS = ['LEAD', 'COMMUNICATION', 'PIPELINE', 'DOCUMENTS', 'CONVERSION', 'STATUS'];

// Real follow-up rows for the Leads page — powers the Today's / Overdue KPI
// cards and the Last / Next Follow-up columns. Best-effort: a failure here must
// never block the leads list itself.
async function fetchLeadFollowUps() {
  try {
    const res = await leadService.listCrm('followups', { page: 0, size: 500 });
    return Array.isArray(res)
      ? res
      : res?.content || res?.data?.content || res?.data?.rows || [];
  } catch {
    return null;
  }
}

// Today's / Overdue follow-up counts straight from the follow-ups API, using
// the same `dateFrom` / `dateTo` filters the Follow-ups module's own cards use.
// Counted server-side (page size 1 + totalElements) so the numbers are not
// limited by the paged history fetch above, and read from `followupDate` (the
// real due date) rather than `updatedAt`, which is only an edit timestamp.
async function fetchFollowUpDueCounts(today) {
  const countOf = async (params) => {
    const res = await leadService.listCrm('followups', { page: 0, size: 1, ...params });
    const total = res?.totalElements ?? res?.data?.totalElements ?? res?.data?.total ?? res?.total;
    const count = Number(total);
    return Number.isFinite(count) ? count : null;
  };
  try {
    // Day before `today`, in the same (UTC) calendar the app's todayISO() uses.
    const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
    const [todayCount, overdueCount] = await Promise.all([
      countOf({ dateFrom: today, dateTo: today }),
      // Everything due before today is overdue — the Follow-ups module's rule.
      countOf({ dateTo: yesterday })
    ]);
    if (todayCount == null || overdueCount == null) return null;
    return { today: todayCount, overdue: overdueCount };
  } catch {
    return null;
  }
}

export default function Leads({ embedded = false }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [ownerModal, setOwnerModal] = useState(null);
  const [stageModal, setStageModal] = useState(null);
  const [priorityModal, setPriorityModal] = useState(null);
  const [noteModal, setNoteModal] = useState(null);
  const [attachmentModal, setAttachmentModal] = useState(null);
  // Lead-scoped communication dialogs — Log Call / Send Email stay on this page
  // instead of navigating to /followups.
  const [callModal, setCallModal] = useState(null);
  const [emailModal, setEmailModal] = useState(null);
  // Bumped on every open so the dialog remounts with a clean entry — the same
  // remount-by-key idiom the other lead dialogs use.
  const [dialogToken, setDialogToken] = useState(0);
  const [followups, setFollowups] = useState([]);
  // Database counts behind the Today's / Overdue Follow-ups KPI cards. Kept in
  // state so a failed request shows the last known value instead of a silent 0.
  const [followUpCounts, setFollowUpCounts] = useState({ today: 0, overdue: 0 });
  // Read-only Preview (Actions ⋮ → Preview) — same UX as Quotations.
  const [previewLead, setPreviewLead] = useState(null);

  // Re-reads the follow-up history after a call/email is logged from the row
  // actions, so the Last / Next Follow-up columns and KPI cards reflect it.
  const loadFollowups = useCallback(async () => {
    const rows = await fetchLeadFollowUps();
    if (rows) setFollowups(rows);
    const counts = await fetchFollowUpDueCounts(todayISO());
    if (counts) setFollowUpCounts(counts);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await fetchLeadFollowUps();
      if (!cancelled && rows) setFollowups(rows);
      const counts = await fetchFollowUpDueCounts(todayISO());
      if (!cancelled && counts) setFollowUpCounts(counts);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Follow-up date history per lead (real backend data used by the Last
  // Follow-up field/dropdown — newest dates first when opened).
  const followupsByLead = useMemo(() => {
    const map = new Map();
    (Array.isArray(followups) ? followups : []).forEach((fu) => {
      const leadId = Number(fu.leadId);
      if (!leadId) return;
      if (!map.has(leadId)) map.set(leadId, []);
      map.get(leadId).push(fu);
    });
    return map;
  }, [followups]);

  const renderers = useMemo(
    () => ({
      businessName: (row) => (
        <span className="crm-erp-cell-main">{row.businessName || row.company || row.name || '—'}</span>
      ),
      contactPerson: (row) => <span>{row.name || '—'}</span>,
      phone: (row) => <span>{row.phone || '—'}</span>,
      email: (row) => <span className="crm-erp-cell-muted">{row.email || '—'}</span>,
      industry: (row) => <span>{row.industry || '—'}</span>,
      source: (row) => <span>{row.source || '—'}</span>,
      stage: (row) => {
        const chip = STAGE_BY_VALUE[row.stage]?.chip || 'bg-slate-100 text-slate-600 border border-slate-200';
        return (
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${chip}`}>
            {row.stage}
          </span>
        );
      },
      owner: (row) => <span>{row.owner || '—'}</span>,
      priority: (row) => {
        const colorMap = { Low: '#6b7280', Medium: '#d97706', High: '#dc2626', Urgent: '#7c3aed' };
        const color = colorMap[row.priority];
        return row.priority ? (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold text-white" style={{ background: color }}>
            {row.priority}
          </span>
        ) : (
          <span className="crm-erp-cell-muted">—</span>
        );
      },
      expectedValue: (row) => <span className="crm-erp-cell-strong">{formatINR(row.value)}</span>,
      lastFollowup: (row) => (
        <LastFollowupHistory history={followupsByLead.get(Number(row.id)) || []} />
      ),
      nextFollowup: (row) => {
        const next = nextFollowUpDate(followupsByLead.get(Number(row.id)));
        return <span className="crm-erp-cell-muted">{next ? formatDate(next) : '—'}</span>;
      },
      status: (row) => (
        <span className={STATUS_BADGE[row.status] || 'crm-erp-status'}>
          {row.status === 'Inactive' ? 'Closed' : row.status || 'Active'}
        </span>
      )
    }),
    [followupsByLead]
  );

  // ---- ERP Actions menu — exact sections, wording and order ----
  const getRowActions = (row) => {
    // Trash lifecycle comes from the REAL record status, not the tab. The
    // Deleted tab lists rows with status "Deleted" — branching only on
    // "Archived" left those rows with the active-record menu (Archive/Delete),
    // so a trashed lead could never be restored from the list. This mirrors the
    // bulk actions in CrmErpList ("Deleted tab: only Restore + Permanent
    // Delete") and the Sales modules' Deleted subtab.
    const isDeleted = row.status === 'Deleted';
    const isArchived = row.status === 'Archived';
    // Closed is presented as "Closed"; it is persisted as the lead's INACTIVE
    // status. A closed lead still has a lifecycle (archive / trash / reopen via
    // the API) but it cannot start new active work.
    const isClosed = row.status === 'Inactive';
    const isActive = !isDeleted && !isArchived && !isClosed;
    const stageValue = String(row.stage || '').toLowerCase();

    const menu = [
      [
        { key: 'preview', label: 'Preview', icon: ScanSearch },
        { key: 'view', label: 'View Lead', icon: Eye },
        { key: 'openInNewTab', label: 'Open in New Tab', icon: ExternalLink },
        // Editing / follow-ups / calls / emails / stage moves / conversions are
        // new active work: never offered for a closed lead (the backend refuses
        // them too). Notes and attachments are record maintenance and stay.
        ...(isClosed ? [] : [{ key: 'edit', label: 'Edit Lead', icon: Pencil }])
      ],
      [
        ...(isClosed
          ? []
          : [
              { key: 'addFollowup', label: 'Add Follow-up', icon: PhoneCall },
              { key: 'logCall', label: 'Log Call', icon: Phone },
              // Page-owned key: the shared list component's own 'sendEmail' action
              // keeps the plain mail hand-off for Clients/Follow-ups — this page
              // composes the email inline instead.
              { key: 'leadSendEmail', label: 'Send Email', icon: Mail }
            ]),
        { key: 'addNote', label: 'Add Note', icon: StickyNote },
        { key: 'uploadAttachment', label: 'Upload Attachment', icon: Paperclip }
      ],
      [
        ...(isClosed ? [] : [{ key: 'moveStage', label: 'Move Stage', icon: TrendingUp }]),
        { key: 'assignOwner', label: 'Assign Owner', icon: UserCheck },
        { key: 'changePriority', label: 'Change Priority', icon: Flag }
      ],
      [
        { key: 'generatePDF', label: 'Generate PDF', icon: FileText },
        { key: 'export', label: 'Export', icon: Download }
      ],
      // ERP leads.js conversion gates: Convert to Client is offered only for
      // qualified/won/negotiation leads that are not yet converted, and
      // Create Customer Purchase Order only for won leads. Conversions are
      // only offered for live records — an archived or trashed lead must not
      // be turned into a Client / CPR / Quotation / CPO.
      isActive
        ? [
            ...(row.status !== 'converted' &&
            ['qualified', 'won', 'negotiation'].includes(stageValue)
              ? [{ key: 'convertClient', label: 'Convert to Client', icon: UserPlus }]
              : []),
            { key: 'createCpr', label: 'Create CPR', icon: ClipboardList },
            { key: 'createQuotation', label: 'Create Quotation', icon: FileText },
            ...(stageValue === 'won'
              ? [{ key: 'createSalesOrder', label: 'Create Customer Purchase Order', icon: ClipboardSignature }]
              : [])
          ]
        : [],
      isDeleted
        ? [
            { key: 'restore', label: 'Restore', icon: RotateCcw },
            { key: 'permanentDelete', label: 'Permanent Delete', icon: Trash2, danger: true }
          ]
        : isArchived
          ? [
              { key: 'restore', label: 'Restore', icon: RotateCcw },
              { key: 'delete', label: 'Delete', icon: Trash2, danger: true }
            ]
          : [
              { key: 'archive', label: 'Archive', icon: Archive },
              { key: 'delete', label: 'Delete', icon: Trash2, danger: true }
            ]
    ];
    // Groups that are empty for this row are dropped entirely, so a section
    // heading (e.g. CONVERSION on a trashed lead) never renders with no items.
    return menu.flatMap((items, index) => (items.length ? [{ section: ACTIONS_SECTIONS[index] }, ...items] : []));
  };

  // Automatic Lead → Follow-up conversion (triggered by the existing
  // "Add Follow-up" action). Calls POST /leads/{id}/follow-up; the backend
  // returns the created follow-up or the already-existing one.
  const createAutoFollowUp = async (row) => {
    try {
      const res = await leadService.createFollowUp(row.id);
      const { created, followUp } = res?.data ?? {};
      if (followUp?.id) {
        toast.success(
          created
            ? `Follow-up created for ${row.businessName || row.name || 'the lead'}`
            : 'A follow-up already exists for this lead'
        );
        navigate(`/followups/${followUp.id}/edit`);
      } else {
        toast.error('Failed to create follow-up');
      }
    } catch (err) {
      toast.error(err?.message || 'Failed to create follow-up');
    }
  };

  // Single-lead PDF (existing erp-react export layout) + single-lead CSV export.
  const generateLeadPdf = (row) => {
    exportPDFDetailed([row], LEAD_EXPORT_COLUMNS, `lead-${row.id}`);
  };
  const exportLeadCsv = (row) => {
    exportCSV([row], LEAD_EXPORT_COLUMNS, `lead-${row.id}`);
  };

  const onRowAction = (actionKey, row) => {
    switch (actionKey) {
      case 'preview':
        setPreviewLead(row);
        break;
      case 'assignOwner':
        setOwnerModal(row);
        break;
      case 'moveStage':
        setStageModal(row);
        break;
      case 'changePriority':
        setPriorityModal(row);
        break;
      case 'addFollowup':
        // ERP lead → follow-up workflow: the existing action now performs the
        // real automatic conversion — the backend creates the follow-up from
        // the lead's data (idempotently) and we open the created record.
        createAutoFollowUp(row);
        break;
      case 'logCall':
        // Inline dialog — the call is logged against this lead without leaving
        // the Leads page (persisted through the existing follow-up API).
        setDialogToken((token) => token + 1);
        setCallModal(row);
        break;
      case 'leadSendEmail':
        // Inline composition dialog — same lead context, no navigation.
        setDialogToken((token) => token + 1);
        setEmailModal(row);
        break;
      case 'addNote':
        setNoteModal(row);
        break;
      case 'uploadAttachment':
        setAttachmentModal(row);
        break;
      case 'convertClient':
        navigate(`/clients/new?leadId=${row.id}`);
        break;
      case 'createCpr':
        navigate(`/cprs/new?leadId=${row.id}`);
        break;
      case 'createQuotation': {
        const customer = encodeURIComponent(row.businessName || row.company || row.name || '');
        navigate(`/quotations/new?leadId=${row.id}&customer=${customer}`);
        break;
      }
      case 'createSalesOrder': {
        const customer = encodeURIComponent(row.businessName || row.company || row.name || '');
        navigate(`/sales-orders/new?leadId=${row.id}&customer=${customer}`);
        break;
      }
      case 'generatePDF':
        generateLeadPdf(row);
        break;
      case 'export':
        exportLeadCsv(row);
        break;
      default:
        break;
    }
  };

  // ERP lead KPI cards — every value comes from a live API response.
  const getKpis = ({ rows, totalCount, statusCounts = {}, setFilter, setClientFilter }) => {
    // Use API-level status counts for accurate KPI values (not page data)
    const stageCount = (stage) => statusCounts[stage] ?? rows.filter((r) => r.stage === stage).length;
    // Both cards read the API's due-date counts (see fetchFollowUpDueCounts).
    const fuToday = followUpCounts.today;
    const fuOverdue = followUpCounts.overdue;

    const filterStage = (stage) => {
      setFilter('stage', stage);
      setClientFilter('status', '');
    };

    return [
      { key: 'totalleads', label: 'Total Leads', value: totalCount, icon: Users, color: '#0B4A3D', onClick: () => { setFilter('stage', ''); setClientFilter('status', ''); }, newTabUrl: '/leads' },
      { key: 'new', label: 'New', value: stageCount('New'), icon: Star, color: '#6b7280', onClick: () => filterStage('New'), newTabUrl: '/leads?status=New' },
      { key: 'qualified', label: 'Qualified', value: stageCount('Qualified'), icon: CheckCircle, color: '#065f46', onClick: () => filterStage('Qualified'), newTabUrl: '/leads?status=Qualified' },
      { key: 'proposalsent', label: 'Proposal Sent', value: stageCount('Proposal Sent'), icon: FileText, color: '#d97706', onClick: () => filterStage('Proposal Sent'), newTabUrl: '/leads?status=Proposal+Sent' },
      { key: 'won', label: 'Won', value: stageCount('Won'), icon: Trophy, color: '#059669', onClick: () => filterStage('Won'), newTabUrl: '/leads?status=Won' },
      { key: 'lost', label: 'Lost', value: stageCount('Lost'), icon: XCircle, color: '#ef4444', onClick: () => filterStage('Lost'), newTabUrl: '/leads?status=Lost' },
      { key: 'todayfollowups', label: "Today's Follow-ups", value: fuToday, icon: Phone, color: '#f59e0b', onClick: () => { setFilter('stage', ''); setClientFilter('status', ''); }, newTabUrl: '/followups' },
      { key: 'overduefollowups', label: 'Overdue Follow-ups', value: fuOverdue, icon: AlertTriangle, color: '#dc2626', onClick: () => { setFilter('stage', ''); setClientFilter('status', ''); }, newTabUrl: '/followups' }
    ];
  };

  useDropdownVersion();
  useSettingsOptions('lead_stage');
  useSettingsOptions('lead_source');
  useSettingsOptions('lead_priority');
  // Managed stage/source/priority option lists (enabled values only).
  // Settings-backed categories come from Marketing Settings (database);
  // the rest keep the local dropdownManager overlay.
  const managedStageFilterOptions = getEffectiveEnabledOptions('lead_stage').map((o) => ({ value: o.value, label: o.value }));
  const managedSourceFilterOptions = getEffectiveEnabledOptions('lead_source').map((o) => ({ value: o.value, label: o.value }));
  const managedPriorityFilterOptions = getEffectiveEnabledOptions('lead_priority').map((o) => ({ value: o.value, label: o.value }));

  const LEAD_FILTERS = useMemo(
    () => [
      {
        // ERP leads.html “All Statuses— — pipeline-style values. The backend
        // stores these under the stage column, so this filter matches row.stage
        // client-side using the managed ERP stage set.
        key: 'status', label: 'Status', type: 'select', mode: 'client', dataKey: 'stage',
        options: [{ value: '', label: 'All Statuses' }, ...managedStageFilterOptions]
      },
      {
        key: 'stage', label: 'Stage', type: 'select', mode: 'api',
        options: [{ value: '', label: 'All Stages' }, ...managedStageFilterOptions]
      },
      {
        key: 'source', label: 'Source', type: 'select', mode: 'api',
        options: [{ value: '', label: 'All Sources' }, ...managedSourceFilterOptions]
      },
      {
        key: 'priority', label: 'Priority', type: 'select', mode: 'client',
        options: [{ value: '', label: 'All Priorities' }, ...managedPriorityFilterOptions]
      },
      {
        key: 'owner', label: 'Owner', type: 'select', mode: 'client',
        options: (rows) => [
          { value: '', label: 'All Owners' },
          ...Array.from(new Set(rows.map((r) => r.owner).filter(Boolean))).map((v) => ({ value: v, label: v }))
        ]
      }
    ],
    [managedStageFilterOptions, managedSourceFilterOptions, managedPriorityFilterOptions]
  );

  return (
    <>
    <CrmErpList
      title="Your Leads"
      titleIcon={Users}
      breadcrumb={['Sales', 'Leads']}
      endpoint="leads"
      noun="lead"
      filename="leads"
      columns={LEAD_COLUMNS}
      /* Wide ERP grid: explicit column widths (LEAD_COLUMNS) + the spacious
         cell rhythm (crm-erp.css "SPACIOUS DATA GRID"). */
      spacious
      selectColumnWidth={52}
      renderers={renderers}
      filters={LEAD_FILTERS}
      kpis={getKpis}
      searchPlaceholder="Search by Lead No, Name, Phone, Email..."
      extraHeaderActions={
        <button
          className="crm-erp-btn crm-erp-btn-ghost"
          onClick={() => navigate('/crm?tab=pipeline')}
          title="Lead Pipeline"
        >
          <Columns2 />
          Pipeline
        </button>
      }
      addButton={{ label: 'Add Lead', to: '/leads/new' }}
      emptyMessage="No leads found matching your criteria."
      errorMessage="Failed to load leads. Please try again."
      embedded={embedded}
      viewRoute={(row) => `/leads/${row.id}`}
      rowActions={getRowActions}
      onRowAction={onRowAction}
      modalSlot={({ assignOwner, changeStage, changePriority, toast, refresh }) => (
        <>
          <AssignOwnerModal
            key={ownerModal?.id ?? 'owner-modal-closed'}
            open={ownerModal !== null}
            lead={ownerModal}
            onClose={() => setOwnerModal(null)}
            onSubmit={async (owner) => {
              const result = await assignOwner(ownerModal.id, owner);
              if (result.ok) {
                toast.success(`Owner assigned to ${ownerModal.name}`);
                setOwnerModal(null);
                return true;
              }
              toast.error(result.error?.message || 'Failed to assign owner');
              return false;
            }}
          />
          <ChangeStageModal
            key={stageModal?.id ?? 'stage-modal-closed'}
            open={stageModal !== null}
            lead={stageModal}
            onClose={() => setStageModal(null)}
            onSubmit={async (stage) => {
              // Renamed stages resolve back to the original ERP label for the API.
              const result = await changeStage(stageModal.id, stageToApiLabel(stage));
              if (result.ok) {
                toast.success(`Stage changed to ${stage} for ${stageModal.name}`);
                setStageModal(null);
                return true;
              }
              toast.error(result.error?.message || 'Failed to change stage');
              return false;
            }}
          />
          <ChangePriorityModal
            key={priorityModal?.id ?? 'priority-modal-closed'}
            open={priorityModal !== null}
            lead={priorityModal}
            onClose={() => setPriorityModal(null)}
            onSubmit={async (priority) => {
              const result = await changePriority(priorityModal.id, priority);
              if (result.ok) {
                toast.success(`Priority changed to ${priority} for ${priorityModal.name}`);
                setPriorityModal(null);
                return true;
              }
              toast.error(result.error?.message || 'Failed to change priority');
              return false;
            }}
          />
          <AddNoteModal
            key={noteModal?.id ?? 'note-modal-closed'}
            open={noteModal !== null}
            lead={noteModal}
            onClose={() => setNoteModal(null)}
            onSubmit={async (text) => {
              try {
                await leadService.addNote(noteModal.id, { text });
                toast.success('Note added');
                setNoteModal(null);
                return true;
              } catch (err) {
                toast.error(err?.message || 'Failed to add note');
                return false;
              }
            }}
          />
          <LogCallModal
            key={`log-call-${dialogToken}`}
            open={callModal !== null}
            lead={callModal}
            onClose={() => setCallModal(null)}
            onSaved={() => {
              // Refresh the follow-up history that feeds the Last / Next
              // Follow-up columns and the KPI cards.
              loadFollowups();
              refresh?.();
            }}
          />
          <SendEmailModal
            key={`send-email-${dialogToken}`}
            open={emailModal !== null}
            lead={emailModal}
            onClose={() => setEmailModal(null)}
            onSaved={() => {
              loadFollowups();
              refresh?.();
            }}
          />
          <UploadAttachmentModal
            key={attachmentModal?.id ?? 'attachment-modal-closed'}
            open={attachmentModal !== null}
            lead={attachmentModal}
            onClose={() => setAttachmentModal(null)}
            onSubmit={async (file) => {
              try {
                const formData = new FormData();
                formData.append('file', file);
                await leadService.addAttachment(attachmentModal.id, formData);
                toast.success('Attachment uploaded');
                setAttachmentModal(null);
                return true;
              } catch (err) {
                toast.error(err?.message || 'Failed to upload attachment');
                return false;
              }
            }}
          />
        </>
      )}
    />

    {/* ===== READ-ONLY PREVIEW (Actions ⋮ → Preview) ===== */}
    <RecordPreviewModal
      open={previewLead !== null}
      onClose={() => setPreviewLead(null)}
      title={previewLead?.leadNo || (previewLead?.id != null ? `LEAD-${String(previewLead.id).padStart(6, '0')}` : 'Lead')}
      subtitle={previewLead?.businessName || previewLead?.company || previewLead?.name || ''}
      status={previewLead?.status}
      sections={[
        {
          heading: 'Lead',
          rows: [
            ['Contact Person', previewLead?.name],
            ['Phone', previewLead?.phone],
            ['Email', previewLead?.email],
            ['Industry', previewLead?.industry],
            ['Lead Source', previewLead?.source],
            ['Stage', previewLead?.stage],
            ['Owner', previewLead?.owner],
            ['Priority', previewLead?.priority],
            ['Expected Value', previewLead?.value != null ? formatINR(previewLead.value) : ''],
            ['Status', previewLead?.status]
          ]
        }
      ]}
      footer={
        previewLead && (
          <>
            <button type="button" className="crm-erp-btn crm-erp-btn-ghost" onClick={() => setPreviewLead(null)}>
              Close
            </button>
            <button type="button" className="crm-erp-btn crm-erp-btn-primary" onClick={() => { navigate(`/leads/${previewLead.id}`); setPreviewLead(null); }}>
              Open in Existing Page
            </button>
            <button type="button" className="crm-erp-btn crm-erp-btn-primary" onClick={() => { openInNewTab(`/leads/${previewLead.id}`); setPreviewLead(null); }}>
              Open in New Tab
            </button>
          </>
        )
      }
    />
    </>
  );
}
