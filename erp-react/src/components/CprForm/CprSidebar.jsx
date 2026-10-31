import { useRef, useState } from 'react';
import EditCountBadge from '../EditHistory/EditCountBadge';
import EditHistoryTimeline from '../EditHistory/EditHistoryTimeline';
import {
  CheckCircle2,
  ChevronDown,
  CloudUpload,
  FileImage,
  FileSpreadsheet,
  FileText,
  History,
  Inbox,
  Paperclip,
  X
} from 'lucide-react';
import { useToast } from '../Common';
import { MAX_ATTACHMENT_SIZE_LABEL, getAttachmentSelectionError } from '../../utils/attachmentStorage';

// Exact color maps from the original ERP (js/pr-create.js _updatePriorityBadge / _statusColor)
const PRIORITY_COLORS = { low: '#6b7280', medium: '#d97706', high: '#dc2626', critical: '#7c3aed' };
const STATUS_COLORS = {
  draft: '#6b7280', submitted: '#0B4A3D', pending: '#d97706',
  approved: '#16a34a', rejected: '#dc2626', closed: '#6B7280', cancelled: '#9ca3af'
};
// ERP _setApprovalDisplay status colors (colored text, not a pill)
const APPROVAL_COLORS = { approved: '#16a34a', rejected: '#dc2626', returned: '#d97706', pending: '#9ca3af' };

function formatCurrency(amount) {
  return '₹ ' + Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

// Matches the ERP's fmtDate (en-IN with date + time)
function fmtDate(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return d;
  }
}

function fileIcon(name) {
  const n = (name || '').toLowerCase();
  if (n.endsWith('.pdf')) return FileText;
  if (n.endsWith('.doc') || n.endsWith('.docx')) return FileText;
  if (n.endsWith('.xls') || n.endsWith('.xlsx')) return FileSpreadsheet;
  if (n.endsWith('.png') || n.endsWith('.jpg') || n.endsWith('.jpeg')) return FileImage;
  return Paperclip;
}

// Replicates the ERP's sales-form-card/form-card-sm: 1px #E2E8F0 border,
// 16px radius, header (14px 20px, #f3f4f6 divider, 15px brand icon, 12px
// chevron that rotates -90deg when collapsed), body padding 16px, and the
// fixed sidebar body max-height 320px (380px for the first card) with scroll.
// The ERP accordion starts every sidebar card collapsed on a fresh load.
function SideCard({ icon: Icon, title, children, compact = false, maxHeight = 320 }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-surface border border-[#E2E8F0] rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden mb-5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
        className="w-full flex items-center justify-between gap-3 px-5 py-3.5 border-b border-[#f3f4f6] cursor-pointer text-left select-none transition-colors duration-150 hover:bg-[#f9fafb]"
      >
        <h3 className="flex items-center gap-2 text-sm font-semibold text-[#111827] m-0">
          <Icon className="w-[15px] h-[15px] text-[#0B4A3D] shrink-0" />
          {title}
        </h3>
        <ChevronDown
          className={`w-3 h-3 text-[#9ca3af] shrink-0 transition-transform duration-[250ms] ${open ? '' : '-rotate-90'}`}
        />
      </button>
      {open && (
        <div
          className="p-4"
          style={compact ? { maxHeight, overflowY: 'auto' } : undefined}
        >
          {children}
        </div>
      )}
    </div>
  );
}

// ERP .prc-summary-row: 12px, --text-body (#374151); value 600 --text-primary (#0B1F1A) right-aligned
function SummaryRow({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs text-[#374151]">
      <span>{label}</span>
      <span className="font-semibold text-[#0B1F1A] text-right">{children}</span>
    </div>
  );
}

// ERP .prc-section-label: 10px, 600, --text-muted (#9CA3AF), uppercase, letter-spacing 0.5px, margin-bottom 2px
function SummarySection({ label }) {
  return <div className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-[0.5px] mb-0.5">{label}</div>;
}

// ERP .prc-divider: 1px --border-color (#E2E8F0), margin 4px 0
function Divider() {
  return <div className="border-t border-[#E2E8F0] my-1" />;
}

// ERP .pr-summary-badge: background COLOR15 / color COLOR, 2px 10px, radius 20px, 11px, 600, line-height 1.5
function Badge({ color, children }) {
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold leading-[1.5]"
      style={{ background: `${color}15`, color }}
    >
      {children}
    </span>
  );
}

function Muted({ children }) {
  // ERP renders approval summary values with the persistent inline muted color
  // (var(--text-muted), #9CA3AF) while keeping the .prc-summary-value 600 weight.
  return <span className="text-[#9CA3AF] font-semibold">{children}</span>;
}

export default function CprSidebar({ form, items, files = [], onFilesChange, record = null }) {
  const fileInputRef = useRef(null);
  const toast = useToast();

  // Files outside the shared upload policy (unsupported type, empty file or
  // larger than the shared 2 GB per-file limit) are rejected with a warning
  // toast and never queued.
  const acceptFiles = (list) => {
    const accepted = [];
    list.forEach((f) => {
      const err = getAttachmentSelectionError(f);
      if (err) {
        toast.warning(err.message);
      } else {
        accepted.push(f);
      }
    });
    if (accepted.length > 0) {
      onFilesChange?.([...files, ...accepted]);
    }
  };

  const totalQty = items.reduce((sum, it) => sum + (parseFloat(it.qty) || 0), 0);
  const estimatedValue = items.reduce(
    (sum, it) => sum + (parseFloat(it.qty) || 0) * (parseFloat(it.estimatedCost) || 0),
    0
  );

  const priority = (form.priority || '').toLowerCase();
  const status = (form.status || '').toLowerCase();

  // Approval workflow values come from the loaded backend record (edit mode);
  // for a new CPR the ERP defaults to 'Pending Approval'. ERP shows the stored
  // approvalStatus verbatim and only colors it once a status exists (an empty
  // status keeps the default .prc-summary-value --text-primary colour).
  const approvalKey = String(record?.approvalStatus || '').toLowerCase();
  const approvalLabel = record?.approvalStatus || 'Pending Approval';
  const approvalColor = approvalKey ? APPROVAL_COLORS[approvalKey] || '#9ca3af' : '#0B1F1A';

  const handleFiles = (e) => {
    const list = Array.from(e.target.files || []);
    if (list.length > 0) {
      acceptFiles(list);
    }
    e.target.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const list = Array.from(e.dataTransfer?.files || []);
    if (list.length > 0) {
      acceptFiles(list);
    }
  };

  const removeFile = (index) => {
    onFilesChange?.(files.filter((_, i) => i !== index));
  };

  return (
    <div>
      {/* ===== PURCHASE SUMMARY ===== */}
      <SideCard icon={FileText} title="Purchase Summary" compact maxHeight={380}>
        <div className="flex flex-col gap-1.5">
          <SummarySection>Document</SummarySection>
          <SummaryRow label="PR Number">{form.prNo || '-'}</SummaryRow>
          <SummaryRow label="Reference No">{form.referencePrNo || '-'}</SummaryRow>
          <SummaryRow label="Required Date">{form.requiredDate || '-'}</SummaryRow>

          <Divider />

          <SummarySection>Status</SummarySection>
          <SummaryRow label="Priority">
            {form.priority ? (
              <Badge color={PRIORITY_COLORS[priority] || '#6b7280'}>{form.priority}</Badge>
            ) : (
              '-'
            )}
          </SummaryRow>
          <SummaryRow label="Status">
            <Badge color={STATUS_COLORS[status] || '#6b7280'}>{form.status || 'Draft'}</Badge>
          </SummaryRow>

          <Divider />

          <SummarySection>People</SummarySection>
          <SummaryRow label="Department">{form.department || '-'}</SummaryRow>
          <SummaryRow label="Requester">{form.requestedBy || '-'}</SummaryRow>
          <SummaryRow label="Preferred Vendor">{form.vendor || 'Not Selected'}</SummaryRow>

          <Divider />

          <SummarySection>Items</SummarySection>
          <SummaryRow label="Items">{items.length}</SummaryRow>
          <SummaryRow label="Qty">{totalQty}</SummaryRow>
          <SummaryRow label="Est. Value">{formatCurrency(estimatedValue)}</SummaryRow>
          <SummaryRow label="Attachments">{files.length}</SummaryRow>

          <Divider />

          <SummarySection>Activity</SummarySection>
          <SummaryRow label="Created">
            {record?.createdAt ? fmtDate(record.createdAt) : fmtDate(new Date().toISOString())}
          </SummaryRow>
          <SummaryRow label="Last Saved">{record?.updatedAt ? fmtDate(record.updatedAt) : '-'}</SummaryRow>
        </div>
      </SideCard>

      {/* ===== APPROVAL STATUS ===== */}
      <SideCard icon={CheckCircle2} title="Approval Status" compact maxHeight={320}>
        <div className="flex flex-col gap-1.5">
          <SummarySection>Current</SummarySection>
          <SummaryRow label="Status">
            <span className="font-semibold" style={{ color: approvalColor }}>
              {approvalLabel}
            </span>
          </SummaryRow>
          <SummaryRow label="Pending With">
            <Muted>&mdash;</Muted>
          </SummaryRow>

          <Divider />

          <SummarySection>Submission</SummarySection>
          <SummaryRow label="Submitted By">
            <Muted>{record?.submittedBy || '—'}</Muted>
          </SummaryRow>
          <SummaryRow label="Date">
            <Muted>{record?.submittedAt ? fmtDate(record.submittedAt) : '—'}</Muted>
          </SummaryRow>

          <Divider />

          <SummarySection>Decision</SummarySection>
          <SummaryRow label="Approved By">
            <Muted>{record?.approvedBy || '—'}</Muted>
          </SummaryRow>
          <SummaryRow label="Date">
            <Muted>{record?.approvalDate ? fmtDate(record.approvalDate) : '—'}</Muted>
          </SummaryRow>
          <SummaryRow label="Rejected By">
            <Muted>{record?.rejectedBy || '—'}</Muted>
          </SummaryRow>
          <SummaryRow label="Date">
            <Muted>{record?.rejectedAt ? fmtDate(record.rejectedAt) : '—'}</Muted>
          </SummaryRow>
          {/* The ERP renders this Remarks row with display:none — kept for DOM parity. */}
          <div className="hidden">
            <SummaryRow label="Remarks">
              <Muted>{record?.approvalRemarks || '—'}</Muted>
            </SummaryRow>
          </div>
        </div>
      </SideCard>

      {/* ===== ATTACHMENTS ===== */}
      <SideCard icon={Paperclip} title="Attachments" compact maxHeight={320}>
        <div
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className="border-2 border-dashed border-slate-300 rounded-lg py-6 px-4 text-center cursor-pointer transition-all hover:border-[#0B4A3D] hover:bg-[#E8F0EE]/50"
        >
          <CloudUpload className="w-6 h-6 text-[#0B4A3D] mx-auto mb-2" />
          <p className="text-xs font-semibold text-slate-700">
            Drag &amp; drop files or <span className="text-[#0B4A3D] font-bold">browse</span>
          </p>
          <p className="text-[11px] text-slate-400 mt-1">PDF, DOCX, XLSX, PNG, JPG up to {MAX_ATTACHMENT_SIZE_LABEL} per file</p>
        </div>
        <input ref={fileInputRef} type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" className="hidden" onChange={handleFiles} />

        {files.length > 0 && (
          <div className="grid grid-cols-2 gap-2 mt-3">
            {files.map((file, index) => {
              const Icon = fileIcon(file.name);
              return (
                <div
                  key={`${file.name}-${index}`}
                  className="relative aspect-square rounded-lg border border-slate-200 bg-slate-50 flex flex-col items-center justify-center gap-1 p-2"
                >
                  <Icon className="w-5 h-5 text-slate-400" />
                  <span className="text-[9px] text-slate-600 text-center truncate w-full">{file.name}</span>
                  <span className="text-[9px] text-slate-400">{formatBytes(file.size)}</span>
                  <button
                    type="button"
                    onClick={() => removeFile(index)}
                    className="absolute top-1 right-1 p-1 rounded-full bg-rose-500 text-white hover:bg-rose-600 transition-colors cursor-pointer"
                    aria-label={`Remove ${file.name}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {files.length > 0 && (
          <p className="text-[10px] text-slate-400 mt-2">
            {files.length} file(s) queued — will be uploaded after this CPR is saved.
          </p>
        )}
      </SideCard>

      {/* ===== ACTIVITY TIMELINE ===== */}
      <SideCard icon={History} title="Activity Timeline" compact maxHeight={360}>
        {record?.id ? (
          <div className="flex flex-col gap-2">
            <EditCountBadge moduleKey="cpr" recordId={record.id} />
            <EditHistoryTimeline moduleKey="cpr" recordId={record.id} limit={5} />
            <div className="text-center py-2">
              <Inbox className="w-5 h-5 text-slate-300 mx-auto mb-1" />
              <p className="text-xs text-slate-400">Full timeline is available in the CPR view</p>
            </div>
          </div>
        ) : (
          <div className="text-center py-6">
            <Inbox className="w-6 h-6 text-slate-300 mx-auto mb-2" />
            <p className="text-xs text-slate-400">No activity yet</p>
          </div>
        )}
      </SideCard>
    </div>
  );
}
