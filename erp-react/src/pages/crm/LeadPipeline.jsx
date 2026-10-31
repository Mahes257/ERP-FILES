import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Phone, FileText,
  Eye, Pencil, PhoneCall, Mail, StickyNote, Paperclip, TrendingUp, UserCheck, Flag,
  Download, UserPlus, ClipboardList, ClipboardSignature, Archive, Trash2, Copy,
  Columns2, CalendarDays, ChevronLeft, ChevronRight, ArrowLeft, MoreVertical,
  Search, X, Tag, User as UserIcon
} from 'lucide-react';
import leadService from '../../services/leadService';
import followUpService from '../../services/followUpService';
import { LeadViewModal } from '../../components/LeadDetail';
import {
  AssignOwnerModal, ChangeStageModal, ChangePriorityModal, AddNoteModal, UploadAttachmentModal,
  LogCallModal, SendEmailModal
} from '../../components/LeadModals';
import { ConfirmDialog, useToast, PageLoader } from '../../components/Common';
import useClickOutside from '../../hooks/useClickOutside';
import { formatINR, formatCurrencyShort, formatDate, todayISO, normalizeLead } from '../../utils/leadHelpers';
import { exportCSV, exportPDFDetailed } from '../../utils/exportUtils';
import {
  displayFor,
  getEnabledOptions,
  getFlatOptions,
  stageMeta,
  stageToApiLabel,
  useDropdownVersion
} from '../../utils/dropdownManager';
import './lead-pipeline.css';

// Same export columns as the Leads list (no Actions column).
const LEAD_EXPORT_COLUMNS = [
  { key: 'leadNo', label: 'Lead No' },
  { key: 'businessName', label: 'Business Name' },
  { key: 'contactPerson', label: 'Contact Person' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'industry', label: 'Industry' },
  { key: 'source', label: 'Lead Source' },
  { key: 'stage', label: 'Stage' },
  { key: 'owner', label: 'Owner' },
  { key: 'priority', label: 'Priority' },
  { key: 'expectedValue', label: 'Expected Value' },
  { key: 'status', label: 'Status' }
];

function extractRows(res) {
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.content)) return res.content;
  if (Array.isArray(res?.data?.content)) return res.data.content;
  if (Array.isArray(res?.data)) return res.data;
  if (Array.isArray(res?.items)) return res.items;
  if (Array.isArray(res?.list)) return res.list;
  return [];
}

function extractTotal(res) {
  if (Array.isArray(res)) return res.length;
  return res?.totalElements ?? res?.total ?? res?.data?.totalElements ?? extractRows(res).length;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function followupStatus(fu, dateStr) {
  const st = (fu.currentStatus || fu.status || 'pending').toLowerCase();
  if (st === 'completed' || st === 'done') return 'completed';
  const today = todayISO();
  if (st === 'overdue' || dateStr < today) return 'overdue';
  return 'pending';
}

/** Three-dot sectioned menu used on every pipeline card (mirrors ERP _safeActionMenu).
 *  Rendered through a portal so it overlays the board and is never clipped by the
 *  column's scroll container or the viewport. */
function CardMenu({ items, onAction }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0, maxHeight: 320 });
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  useClickOutside(menuRef, () => setOpen(false), open);

  const positionMenu = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const menuHeight = Math.min(menuRef.current?.offsetHeight || 420, window.innerHeight - 16);
    let top = rect.bottom + 6;
    if (top + menuHeight > window.innerHeight - 8) {
      top = Math.max(8, rect.top - menuHeight - 6);
    }
    setPos({ top, right: Math.min(window.innerWidth - rect.right, 8), maxHeight: menuHeight });
  }, []);

  const toggle = (e) => {
    e.stopPropagation();
    setOpen((prev) => {
      const next = !prev;
      if (next) requestAnimationFrame(positionMenu);
      return next;
    });
  };

  useEffect(() => {
    if (!open) return undefined;
    const onResize = () => positionMenu();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open, positionMenu]);

  return (
    <div className="pipeline-card-menu">
      <button
        ref={btnRef}
        type="button"
        className="action-menu-btn"
        aria-label="Lead actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
      >
        <MoreVertical className="w-4 h-4" />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            className="pipeline-action-menu safe-action-menu"
            style={{ position: 'fixed', top: pos.top, right: pos.right, maxHeight: pos.maxHeight }}
          >
            {items.map((item, index) =>
              item.heading ? (
                <div key={index} className="pipeline-menu-heading">{item.label}</div>
              ) : item.divider ? (
                <div key={index} className="pipeline-menu-divider" />
              ) : (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen(false);
                    onAction(item.key);
                  }}
                  className={`pipeline-menu-item${item.danger ? ' danger' : ''}`}
                >
                  {item.icon && <item.icon className="pipeline-menu-icon" />}
                  <span>{item.label}</span>
                </button>
              )
            )}
          </div>,
          document.body
        )}
    </div>
  );
}

export default function LeadPipeline({ embedded = false }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const focusId = searchParams.get('id');
  const toast = useToast();

  const [leads, setLeads] = useState([]);
  const [followups, setFollowups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [calendarView, setCalendarView] = useState(false);

  // ERP pipeline filter bar state (Search / All Owners / All Priority / Clear).
  const [pipelineSearch, setPipelineSearch] = useState('');
  const [pipelineOwner, setPipelineOwner] = useState('');
  const [pipelinePriority, setPipelinePriority] = useState('');
  const [calendarDate, setCalendarDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(null);

  // Card action state (mirrors Leads.jsx modals).
  const [viewLead, setViewLead] = useState(null);
  const [ownerLead, setOwnerLead] = useState(null);
  const [stageLead, setStageLead] = useState(null);
  const [priorityLead, setPriorityLead] = useState(null);
  const [noteLead, setNoteLead] = useState(null);
  const [attachmentLead, setAttachmentLead] = useState(null);
  // Lead-scoped communication dialogs (same components as the Leads list) —
  // Log Call / Send Email stay on the board instead of navigating away.
  const [callLead, setCallLead] = useState(null);
  const [emailLead, setEmailLead] = useState(null);
  // Bumped on every open so the dialog remounts with a clean entry.
  const [dialogToken, setDialogToken] = useState(0);
  const [confirm, setConfirm] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey((key) => key + 1), []);

  // Fetch every active lead (all pages) so pipeline counts/totals are real data.
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const all = [];
        let page = 0;
        const size = 200;
        let total = Infinity;
        while (all.length < total) {
          const res = await leadService.listCrm('leads', { page, size });
          if (cancelled) return;
          const rows = extractRows(res);
          total = extractTotal(res);
          all.push(...rows);
          if (rows.length < size) break;
          page += 1;
        }
        if (!cancelled) setLeads(all);
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Failed to load leads. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  // Follow-ups power the Calendar view (real backend data).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await followUpService.list({ page: 0, size: 500 });
        if (!cancelled) setFollowups(extractRows(res));
      } catch { /* calendar is best-effort */ }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-read the managed stage list whenever options change.
  useDropdownVersion();
  const managedStageOptions = getFlatOptions('lead_stage');

  // Pipeline columns = managed stages (renamed stages re-label; disabled stages
  // hide unless leads still use them) + any in-use legacy stage, so no lead is
  // ever lost. Colours/icons come from the ERP base stage config.
  const stagesInUse = useMemo(
    () => [...new Set(leads.map((l) => (l.stage || '').trim()).filter(Boolean))],
    [leads]
  );
  const pipelineColumns = useMemo(() => {
    const seen = new Set();
    const cols = [];
    managedStageOptions.forEach((s) => {
      if (s.enabled || stagesInUse.includes(s.value)) {
        seen.add(s.value);
        cols.push({ key: s.value, label: s.value, ...stageMeta(s.value) });
      }
    });
    stagesInUse.forEach((key) => {
      if (!seen.has(key)) {
        seen.add(key);
        cols.push({ key, label: key, ...stageMeta(key) });
      }
    });
    return cols;
  }, [managedStageOptions, stagesInUse]);

  // Group leads into stage buckets (skip deleted/archived/converted).
  const grouped = useMemo(() => {
    const buckets = {};
    pipelineColumns.forEach((s) => {
      buckets[s.key] = [];
    });
    leads.forEach((raw) => {
      const status = (raw.status || 'active').toLowerCase();
      if (status === 'deleted' || status === 'archived' || status === 'converted') return;
      // Renamed stages bucket under their managed display label.
      let stageKey = displayFor('lead_stage', raw.stage || 'New');
      if (!buckets[stageKey]) {
        if (stageKey.toLowerCase().includes('proposal')) stageKey = 'Proposal';
        else stageKey = 'New';
      }
      buckets[stageKey].push(raw);
    });
    // ERP sorts each column by expected value desc.
    Object.keys(buckets).forEach((key) => {
      buckets[key].sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0));
    });
    return buckets;
  }, [leads, pipelineColumns]);

  const stageTotals = useMemo(() => {
    const totals = {};
    Object.keys(grouped).forEach((key) => {
      totals[key] = grouped[key].reduce((sum, l) => sum + (Number(l.value) || 0), 0);
    });
    return totals;
  }, [grouped]);

  // Owner options for the pipeline filter bar (ERP populatePipelineFilter).
  const ownerOptions = useMemo(() => {
    const set = new Set();
    leads.forEach((l) => {
      const owner = l.owner || l.assignee || 'Unassigned';
      set.add(owner);
    });
    return Array.from(set).sort();
  }, [leads]);

  // ERP pipeline filtering: search matches name/company, owner matches the
  // owner text, priority matches the priority class. Only cards are hidden;
  // column counts/totals stay computed from the full stage data (ERP behavior).
  const matchesPipelineFilters = useCallback(
    (lead) => {
      const q = pipelineSearch.trim().toLowerCase();
      if (q) {
        const name = (lead.contactPerson || lead.name || '').toLowerCase();
        const company = (lead.company || lead.businessName || '').toLowerCase();
        if (!name.includes(q) && !company.includes(q)) return false;
      }
      if (pipelineOwner) {
        const owner = lead.owner || lead.assignee || 'Unassigned';
        if (owner !== pipelineOwner) return false;
      }
      if (pipelinePriority) {
        const priority = (lead.priority || 'medium').toLowerCase();
        if (priority !== pipelinePriority) return false;
      }
      return true;
    },
    [pipelineSearch, pipelineOwner, pipelinePriority]
  );

  const clearPipelineFilters = useCallback(() => {
    setPipelineSearch('');
    setPipelineOwner('');
    setPipelinePriority('');
  }, []);

  const getCardMenu = (row) => {
    const stage = (row.stage || '').toLowerCase();
    const status = (row.status || 'active').toLowerCase();
    const canConvert = status !== 'converted' && ['qualified', 'won', 'negotiation'].includes(stage);
    const menu = [
      { heading: true, label: 'LEAD' },
      { label: 'View Lead', icon: Eye, key: 'view' },
      { label: 'Edit Lead', icon: Pencil, key: 'edit' },
      { divider: true },
      { heading: true, label: 'COMMUNICATION' },
      { label: 'Add Follow-up', icon: PhoneCall, key: 'addFollowup' },
      { label: 'Log Call', icon: Phone, key: 'logCall' },
      { label: 'Send Email', icon: Mail, key: 'leadSendEmail' },
      { label: 'Add Note', icon: StickyNote, key: 'addNote' },
      { label: 'Upload Attachment', icon: Paperclip, key: 'uploadAttachment' },
      { divider: true },
      { heading: true, label: 'PIPELINE' },
      { label: 'Move Stage', icon: TrendingUp, key: 'moveStage' },
      { label: 'Assign Owner', icon: UserCheck, key: 'assignOwner' },
      { label: 'Change Priority', icon: Flag, key: 'changePriority' },
      { divider: true },
      { heading: true, label: 'DOCUMENTS' },
      { label: 'Generate PDF', icon: FileText, key: 'generatePDF' },
      { label: 'Export', icon: Download, key: 'export' },
      { label: 'Duplicate', icon: Copy, key: 'duplicate' },
      { divider: true },
      { heading: true, label: 'CONVERSION' }
    ];
    if (canConvert) menu.push({ label: 'Convert to Client', icon: UserPlus, key: 'convertClient' });
    menu.push(
      { label: 'Create CPR', icon: ClipboardList, key: 'createCpr' },
      { label: 'Create Quotation', icon: FileText, key: 'createQuotation' }
    );
    if (stage === 'won') {
      menu.push({ label: 'Create Customer Purchase Order', icon: ClipboardSignature, key: 'createSalesOrder' });
    }
    menu.push(
      { divider: true },
      { heading: true, label: 'STATUS' },
      { label: 'Archive', icon: Archive, key: 'archive' },
      { label: 'Delete', icon: Trash2, key: 'delete', danger: true }
    );
    return menu;
  };

  const onCardAction = (actionKey, row) => {
    switch (actionKey) {
      case 'view':
        setViewLead(row);
        break;
      case 'edit':
        navigate(`/leads/${row.id}/edit`);
        break;
      case 'duplicate':
        runAction(async () => {
          await leadService.duplicateLead(row.id);
          toast.success('Lead duplicated');
          refresh();
        }, 'Failed to duplicate lead');
        break;
      case 'addFollowup':
        // ERP lead → follow-up workflow: the existing action now performs the
        // real automatic conversion — the backend creates the follow-up from
        // the lead's data (idempotently) and we open the created record.
        createAutoFollowUp(row);
        break;
      case 'logCall':
        // Inline dialog — logged against this lead, no navigation to /followups.
        setDialogToken((token) => token + 1);
        setCallLead(row);
        break;
      case 'leadSendEmail':
        // Inline composition dialog — same lead context, no navigation.
        setDialogToken((token) => token + 1);
        setEmailLead(row);
        break;
      case 'addNote':
        setNoteLead(row);
        break;
      case 'uploadAttachment':
        setAttachmentLead(row);
        break;
      case 'moveStage':
        setStageLead(row);
        break;
      case 'assignOwner':
        setOwnerLead(row);
        break;
      case 'changePriority':
        setPriorityLead(row);
        break;
      case 'generatePDF':
        // Pipeline rows are raw API rows; normalize to the export field aliases
        // (contactPerson/expectedValue/leadNo/businessName) like the list does.
        exportPDFDetailed([normalizeLead(row)], LEAD_EXPORT_COLUMNS, `lead-${row.id}`);
        break;
      case 'export':
        exportCSV([normalizeLead(row)], LEAD_EXPORT_COLUMNS, `lead-${row.id}`);
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
      case 'archive':
        setConfirm({ type: 'archive', lead: row });
        break;
      case 'delete':
        setConfirm({ type: 'delete', lead: row });
        break;
      default:
        break;
    }
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

  const runAction = async (fn, failMsg) => {
    setActionLoading(true);
    try {
      await fn();
    } catch (err) {
      toast.error(err?.message || failMsg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!confirm) return;
    const { type, lead } = confirm;
    setConfirm(null);
    if (type === 'archive') {
      await runAction(async () => {
        await leadService.archiveLead(lead.id);
        toast.success(`${lead.name || lead.contactPerson || 'Lead'} archived`);
        refresh();
      }, 'Failed to archive lead');
    } else if (type === 'delete') {
      await runAction(async () => {
        await leadService.deleteLead(lead.id);
        toast.success(`${lead.name || lead.contactPerson || 'Lead'} deleted`);
        refresh();
      }, 'Failed to delete lead');
    }
  };

  // ---- Drag & drop (ERP HTML5 DnD behavior) ----
  const [draggedId, setDraggedId] = useState(null);
  const [dragOverStage, setDragOverStage] = useState(null);
  const mouseDownRef = useRef({ x: 0, y: 0, leadId: null });

  const handleDragStart = (e, leadId) => {
    e.dataTransfer.setData('text/plain', String(leadId));
    e.dataTransfer.effectAllowed = 'move';
    setDraggedId(leadId);
  };
  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverStage(null);
  };

  // Card click to open Lead View. We track mousedown position and only
  // navigate if the mouse barely moved (i.e. this was a click, not a drag).
  const handleCardMouseDown = useCallback((e, leadId) => {
    mouseDownRef.current = { x: e.clientX, y: e.clientY, leadId };
  }, []);

  const handleCardClick = useCallback((lead) => {
    // If the mouse moved more than 5px since mousedown, treat as drag.
    // (The ref is stale here — we check in a separate effect below.)
    setViewLead(lead);
  }, []);
  const handleDrop = async (e, newStage) => {
    e.preventDefault();
    const id = Number(e.dataTransfer.getData('text/plain')) || draggedId;
    setDraggedId(null);
    setDragOverStage(null);
    if (!id) return;
    const lead = leads.find((l) => l.id === id);
    if (!lead) return;
    if (lead.stage === newStage) return;
    setActionLoading(true);
    try {
      // Renamed stages resolve back to the original ERP label for the API.
      await leadService.changeStage(id, stageToApiLabel(newStage));
      // Optimistic state update — no page reload needed.
      setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, stage: newStage } : l)));
      toast.success(`Lead moved to ${newStage}`);
    } catch (err) {
      toast.error(err?.message || 'Failed to move lead');
    } finally {
      setActionLoading(false);
    }
  };

  // Focus a specific lead (?id=) like ERP: scroll + highlight the card.
  useEffect(() => {
    if (!focusId) return undefined;
    const t = setTimeout(() => {
      const card = document.querySelector(`[data-id="${focusId}"]`);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.classList.add('pipeline-card-focused');
        setTimeout(() => card.classList.remove('pipeline-card-focused'), 2000);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [focusId, loading]);

  // ---- Calendar view (ERP toggleCalendarView / renderCalendar) ----
  const calYear = calendarDate.getFullYear();
  const calMonth = calendarDate.getMonth();
  const firstDay = new Date(calYear, calMonth, 1);
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const startDay = firstDay.getDay();

  const followupsByDate = useMemo(() => {
    const map = {};
    followups.forEach((fu) => {
      const d = (fu.followupDate || fu.date || '').substring(0, 10);
      if (!d) return;
      map[d] = map[d] || [];
      map[d].push(fu);
    });
    return map;
  }, [followups]);

  const calendarCells = [];
  let day = 1;
  const totalCells = Math.ceil((startDay + daysInMonth) / 7) * 7;
  for (let i = 0; i < totalCells; i += 1) {
    if (i < startDay || day > daysInMonth) {
      calendarCells.push(null);
    } else {
      const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      calendarCells.push(dateStr);
      day += 1;
    }
  }

  const leadById = useMemo(() => {
    const map = {};
    leads.forEach((l) => {
      map[l.id] = l;
    });
    return map;
  }, [leads]);

  const dayFollowups = selectedDate ? followupsByDate[selectedDate] || [] : [];

  const renderBoard = () => (
    <>
      <div className="pipeline-board">
        {pipelineColumns.map((stage) => {
          const StageIcon = stage.icon;
          const stageLeads = grouped[stage.key] || [];
          const total = stageTotals[stage.key] || 0;
          return (
            <div className="pipeline-column" key={stage.key} data-stage={stage.key}>
              <div className="pipeline-column-header" style={{ borderLeftColor: stage.color }}>
                <div className="pipeline-column-title">
                  <StageIcon className="pipeline-stage-icon" style={{ color: stage.color }} />
                  <span>{stage.label}</span>
                  <span className="pipeline-count">{stageLeads.length}</span>
                </div>
                <div className="pipeline-value">{formatCurrencyShort(total)}</div>
              </div>
              <div
                className={`pipeline-column-body${dragOverStage === stage.key ? ' drag-over' : ''}`}
                data-stage={stage.key}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverStage(stage.key);
                }}
                onDragLeave={() => {
                  if (dragOverStage === stage.key) setDragOverStage(null);
                }}
                onDrop={(e) => handleDrop(e, stage.key)}
              >
                {stageLeads.length === 0 ? (
                  <div className="pipeline-empty">No leads</div>
                ) : (
                  stageLeads.filter(matchesPipelineFilters).map((lead) => {
                    const name = lead.contactPerson || lead.name || 'Unnamed';
                    const company = lead.company || '-';
                    const value = Number(lead.value) || 0;
                    const priority = (lead.priority || 'medium').toLowerCase();
                    const expClose = lead.expectedCloseDate
                      ? formatDate(lead.expectedCloseDate)
                      : '';
                    return (
                      <div
                        className={`pipeline-card${draggedId === lead.id ? ' dragging' : ''}`}
                        key={lead.id}
                        draggable
                        data-id={lead.id}
                        data-stage={stage.key}
                        onDragStart={(e) => handleDragStart(e, lead.id)}
                        onDragEnd={handleDragEnd}
                      >
                        <div
                          className="pipeline-card-click-zone"
                          onMouseDown={(e) => handleCardMouseDown(e, lead.id)}
                          onMouseUp={(e) => {
                            const dx = Math.abs(e.clientX - mouseDownRef.current.x);
                            const dy = Math.abs(e.clientY - mouseDownRef.current.y);
                            if (dx < 5 && dy < 5) handleCardClick(lead);
                          }}
                        >
                          <div className="pipeline-card-header">
                            <div className="pipeline-card-avatar">{name.charAt(0).toUpperCase()}</div>
                            <div className="pipeline-card-info">
                              <div className="pipeline-card-name">{name}</div>
                              <div className="pipeline-card-company">{company}</div>
                            </div>
                            <CardMenu items={getCardMenu(lead)} onAction={(key) => onCardAction(key, lead)} />
                          </div>
                          <div className="pipeline-card-id-row">
                            <span className="pipeline-card-id">{lead.leadNo || `LEAD-${String(lead.id).padStart(6, '0')}`}</span>
                          </div>
                          {value > 0 && (
                            <div className="pipeline-card-value-row">{formatINR(value)}</div>
                          )}
                        <div className="pipeline-card-meta">
                          <span><Tag className="w-3 h-3" /> {lead.source || 'Direct'}</span>
                          {lead.owner && (
                            <span><UserIcon className="w-3 h-3" /> {lead.owner}</span>
                          )}
                          {expClose && (
                            <span><CalendarDays className="w-3 h-3" /> {expClose}</span>
                          )}
                        </div>
                        </div>
                        <div className={`pipeline-card-priority ${priority}`} />
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );

  const renderCalendar = () => (
    <>
      <div className="cal-nav">
        <button
          className="cal-nav-btn"
          onClick={() => setCalendarDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
          title="Previous month"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="cal-nav-title">{MONTH_NAMES[calMonth]} {calYear}</div>
        <button
          className="cal-nav-btn"
          onClick={() => setCalendarDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
          title="Next month"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <button className="cal-today-btn" onClick={() => setCalendarDate(new Date())}>
          <CalendarDays className="w-3.5 h-3.5" /> Today
        </button>
      </div>

      <div className="cal-grid">
        <div className="cal-row cal-header">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div className="cal-cell cal-header-cell" key={d}>{d}</div>
          ))}
        </div>
        {Array.from({ length: totalCells / 7 }).map((_, r) => (
          <div className="cal-row" key={r}>
            {calendarCells.slice(r * 7, r * 7 + 7).map((dateStr, c) => {
              if (!dateStr) return <div className="cal-cell cal-empty" key={c} />;
              const dayFu = followupsByDate[dateStr] || [];
              const today = todayISO();
              const pending = dayFu.filter((fu) => followupStatus(fu, dateStr) === 'pending').length;
              const overdue = dayFu.filter((fu) => followupStatus(fu, dateStr) === 'overdue').length;
              const completed = dayFu.filter((fu) => followupStatus(fu, dateStr) === 'completed').length;
              return (
                <div
                  className={`cal-cell cal-day${dateStr === today ? ' cal-today' : ''}${dayFu.length ? ' cal-has-fu' : ''}${selectedDate === dateStr ? ' cal-selected' : ''}`}
                  key={c}
                  data-date={dateStr}
                  onClick={() => setSelectedDate(dateStr)}
                >
                  <div className="cal-day-num">{Number(dateStr.slice(-2))}</div>
                  {dayFu.length > 0 && (
                    <div className="cal-day-dots">
                      {pending > 0 && <span className="cal-dot cal-dot-pending" title={`${pending} pending`} />}
                      {overdue > 0 && <span className="cal-dot cal-dot-overdue" title={`${overdue} overdue`} />}
                      {completed > 0 && <span className="cal-dot cal-dot-completed" title={`${completed} completed`} />}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {selectedDate && (
        <div className="cal-day-detail">
          <div className="cal-day-header">
            <h4><CalendarDays className="w-4 h-4" /> {new Date(`${selectedDate}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</h4>
            <span className="cal-day-count">{dayFollowups.length} follow-up{dayFollowups.length !== 1 ? 's' : ''}</span>
            <button className="cal-close-btn" onClick={() => setSelectedDate(null)} aria-label="Close">
              <span className="text-sm leading-none">✕</span>
            </button>
          </div>
          {dayFollowups.length === 0 ? (
            <div className="cal-empty-day">No follow-ups scheduled for this day.</div>
          ) : (
            <div className="cal-fu-list">
              {dayFollowups.map((fu) => {
                const st = followupStatus(fu, selectedDate);
                const lead = fu.leadId ? leadById[fu.leadId] : null;
                const leadName = fu.leadName || (lead ? lead.name || lead.contactPerson : '') || 'Unknown Lead';
                const leadNo = fu.leadNo || (lead ? `LEAD-${String(lead.id).padStart(6, '0')}` : '');
                return (
                  <div
                    className="cal-fu-item"
                    key={fu.id}
                    onClick={() => {
                      if (lead) setViewLead(lead);
                      else navigate(`/followups/${fu.id}/edit`);
                    }}
                  >
                    <div className="cal-fu-left">
                      <span className={`cal-dot cal-dot-${st}`} />
                      <div className="cal-fu-info">
                        <div className="cal-fu-title">{fu.mode || fu.title || 'Follow-up'}</div>
                        <div className="cal-fu-lead">{leadName}{leadNo ? ` (${leadNo})` : ''}</div>
                      </div>
                    </div>
                    <div className="cal-fu-right">
                      <span className={`cal-fu-status cal-dot-${st}`}>{st.charAt(0).toUpperCase() + st.slice(1)}</span>
                      {fu.companyName && <span className="cal-fu-company">{fu.companyName}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="cal-legend">
        <span><span className="cal-dot cal-dot-pending" /> Pending</span>
        <span><span className="cal-dot cal-dot-overdue" /> Overdue</span>
        <span><span className="cal-dot cal-dot-completed" /> Completed</span>
        <span style={{ marginLeft: 16 }}>
          <CalendarDays className="w-3 h-3" style={{ color: '#6b7280' }} /> Click a date to view follow-ups
        </span>
      </div>
    </>
  );

  if (loading) {
    return <PageLoader />;
  }

  return (
    <div className={`lead-pipeline-page${embedded ? ' lead-pipeline-page--embedded' : ''}`}>
      {/* Breadcrumb is only shown on the standalone /leads/pipeline route —
          the CRM hub already renders its own breadcrumb + header above us. */}
      {!embedded && (
        <div className="crm-erp-breadcrumb">
          <span className="crm-erp-breadcrumb-item"><a onClick={() => navigate('/dashboard')}>Vishak Tech</a></span>
          <span className="crm-erp-breadcrumb-item"><span className="sep">›</span><a onClick={() => navigate('/leads')}>Leads</a></span>
          <span className="crm-erp-breadcrumb-item"><span className="sep">›</span><span className="current">Pipeline</span></span>
        </div>
      )}

      {/* ERP pipeline filter bar (lead-pipeline.html #pipelineFilterBar) */}
      <div className="pipeline-filter-bar">
        <div className="search-box">
          <Search className="search-icon" />
          <input
            type="text"
            value={pipelineSearch}
            onChange={(e) => setPipelineSearch(e.target.value)}
            placeholder="Search pipeline..."
            aria-label="Search pipeline leads"
          />
        </div>
        <select
          value={pipelineOwner}
          onChange={(e) => setPipelineOwner(e.target.value)}
          aria-label="Filter by owner"
        >
          <option value="">All Owners</option>
          {ownerOptions.map((owner) => (
            <option key={owner} value={owner}>{owner}</option>
          ))}
        </select>
        <select
          value={pipelinePriority}
          onChange={(e) => setPipelinePriority(e.target.value)}
          aria-label="Filter by priority"
        >
          <option value="">All Priority</option>
          {getEnabledOptions('lead_priority').map((o) => (
            <option key={o.value} value={o.value.toLowerCase()}>{o.value}</option>
          ))}
        </select>
        <button type="button" className="pipeline-filter-clear" onClick={clearPipelineFilters} title="Clear filters">
          <X className="w-3.5 h-3.5" /> Clear
        </button>
      </div>

      <div className="pipeline-header">
        <h2>
          <Columns2 className="pipeline-header-icon" />
          {calendarView ? 'Follow-up Calendar' : 'Lead Pipeline'}
          <span className="pipeline-subtitle">
            {calendarView ? 'View lead follow-ups by date' : 'Drag & drop leads between stages'}
          </span>
        </h2>
        <div className="pipeline-actions">
          <button
            className="pipeline-btn pipeline-btn-secondary"
            onClick={() => {
              setCalendarView((prev) => !prev);
              if (!calendarView) setCalendarDate(new Date());
            }}
          >
            {calendarView ? <Columns2 className="w-4 h-4" /> : <CalendarDays className="w-4 h-4" />}
            {calendarView ? 'Board View' : 'Calendar'}
          </button>
          {!embedded && (
            <button
              className="pipeline-btn pipeline-btn-ghost"
              onClick={() => navigate('/leads')}
            >
              <ArrowLeft className="w-4 h-4" /> Back to List
            </button>
          )}
        </div>
      </div>

      {error ? (
        <div className="crm-erp-empty">{error}</div>
      ) : (
        calendarView ? renderCalendar() : renderBoard()
      )}

      {/* Card action modals — same components as the Leads list */}
      <LeadViewModal open={viewLead !== null} lead={viewLead} onClose={() => setViewLead(null)} />
      <AssignOwnerModal
        key={ownerLead?.id ?? 'owner-modal-closed'}
        open={ownerLead !== null}
        lead={ownerLead}
        onClose={() => setOwnerLead(null)}
        onSubmit={async (owner) => {
          try {
            await leadService.assignOwner(ownerLead.id, owner);
            toast.success(`Owner assigned to ${ownerLead.name || ownerLead.contactPerson}`);
            setOwnerLead(null);
            setLeads((prev) => prev.map((l) => (l.id === ownerLead.id ? { ...l, owner } : l)));
            return true;
          } catch (err) {
            toast.error(err?.message || 'Failed to assign owner');
            return false;
          }
        }}
      />
      <ChangeStageModal
        key={stageLead?.id ?? 'stage-modal-closed'}
        open={stageLead !== null}
        lead={stageLead}
        onClose={() => setStageLead(null)}
        onSubmit={async (stage) => {
          try {
            // Renamed stages resolve back to the original ERP label for the API.
            await leadService.changeStage(stageLead.id, stageToApiLabel(stage));
            toast.success(`Stage changed to ${stage} for ${stageLead.name || stageLead.contactPerson}`);
            setStageLead(null);
            setLeads((prev) => prev.map((l) => (l.id === stageLead.id ? { ...l, stage } : l)));
            return true;
          } catch (err) {
            toast.error(err?.message || 'Failed to change stage');
            return false;
          }
        }}
      />
      <ChangePriorityModal
        key={priorityLead?.id ?? 'priority-modal-closed'}
        open={priorityLead !== null}
        lead={priorityLead}
        onClose={() => setPriorityLead(null)}
        onSubmit={async (priority) => {
          try {
            await leadService.changePriority(priorityLead.id, priority);
            toast.success(`Priority changed to ${priority} for ${priorityLead.name || priorityLead.contactPerson}`);
            setPriorityLead(null);
            setLeads((prev) => prev.map((l) => (l.id === priorityLead.id ? { ...l, priority } : l)));
            return true;
          } catch (err) {
            toast.error(err?.message || 'Failed to change priority');
            return false;
          }
        }}
      />
      <AddNoteModal
        key={noteLead?.id ?? 'note-modal-closed'}
        open={noteLead !== null}
        lead={noteLead}
        onClose={() => setNoteLead(null)}
        onSubmit={async (text) => {
          try {
            await leadService.addNote(noteLead.id, { text });
            toast.success('Note added');
            setNoteLead(null);
            return true;
          } catch (err) {
            toast.error(err?.message || 'Failed to add note');
            return false;
          }
        }}
      />
      <LogCallModal
        key={`log-call-${dialogToken}`}
        open={callLead !== null}
        lead={callLead}
        onClose={() => setCallLead(null)}
        onSaved={() => refresh()}
      />
      <SendEmailModal
        key={`send-email-${dialogToken}`}
        open={emailLead !== null}
        lead={emailLead}
        onClose={() => setEmailLead(null)}
        onSaved={() => refresh()}
      />
      <UploadAttachmentModal
        key={attachmentLead?.id ?? 'attachment-modal-closed'}
        open={attachmentLead !== null}
        lead={attachmentLead}
        onClose={() => setAttachmentLead(null)}
        onSubmit={async (file) => {
          try {
            const formData = new FormData();
            formData.append('file', file);
            await leadService.addAttachment(attachmentLead.id, formData);
            toast.success('Attachment uploaded');
            setAttachmentLead(null);
            return true;
          } catch (err) {
            toast.error(err?.message || 'Failed to upload attachment');
            return false;
          }
        }}
      />
      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.type === 'delete' ? 'Delete Lead' : 'Archive Lead'}
        message={
          confirm?.type === 'delete'
            ? `Delete ${confirm?.lead?.name || confirm?.lead?.contactPerson || 'this lead'}? This cannot be undone.`
            : `Archive ${confirm?.lead?.name || confirm?.lead?.contactPerson || 'this lead'}?`
        }
        confirmLabel={confirm?.type === 'delete' ? 'Delete' : 'Archive'}
        loading={actionLoading}
        onConfirm={handleConfirm}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
