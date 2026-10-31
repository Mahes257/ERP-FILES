import { useRef, useState } from 'react';
import {
  Calculator,
  CheckCircle2,
  ChevronDown,
  CloudUpload,
  Eye,
  FileDown,
  FileImage,
  FileSpreadsheet,
  FileText,
  History,
  Inbox,
  Paperclip,
  PlusCircle,
  Printer,
  Save,
  Send,
  X,
  Zap
} from 'lucide-react';

import EditHistoryTimeline from '../EditHistory/EditHistoryTimeline';
import { MAX_ATTACHMENT_SIZE_LABEL } from '../../utils/attachmentStorage';
import EditCountBadge from '../EditHistory/EditCountBadge';

// ERP _setApprovalDisplay colors (colored text, not a pill)
const APPROVAL_COLORS = { approved: '#16a34a', rejected: '#dc2626', returned: '#d97706', pending: '#9ca3af' };

// ERP cw-create.js _addTimelineEntry icon mapping (fa-plus-circle / fa-save / fa-paper-plane)
const TIMELINE_ICONS = { created: PlusCircle, saved: Save, submitted: Send };

function formatCurrency(amount) {
  return '₹' + Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

// Replicates the ERP's sales-form-card/form-card-sm: 1px #E5E7EB border,
// 16px radius, header with inline icon + accordion chevron, body max-height
// 320px (380px for the first card) with scroll.
function SideCard({ icon: Icon, title, children, compact = false, maxHeight = 320 }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="bg-surface border border-[#E5E7EB] rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden mb-5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100 cursor-pointer text-left select-none"
      >
        <h3 className="flex items-center gap-2 text-sm font-semibold text-[#1E293B] m-0">
          <Icon className="w-[13px] h-[13px] text-[#0B4A3D] shrink-0" />
          {title}
        </h3>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform duration-200 ${open ? '' : '-rotate-90'}`}
        />
      </button>
      {open && (
        <div
          className="px-5 py-5"
          style={compact ? { maxHeight, overflowY: 'auto' } : undefined}
        >
          {children}
        </div>
      )}
    </div>
  );
}

// ERP .prc-summary-row: 12px, --text-body (#374151); value 600 --text-primary (#0B1F1A) right-aligned
function SummaryRow({ label, children, style }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs text-[#374151]" style={style}>
      <span>{label}</span>
      <span className="font-semibold text-[#0B1F1A] text-right">{children}</span>
    </div>
  );
}

// ERP .prc-section-label: 10px, 600, --text-muted (#9CA3AF), uppercase, letter-spacing 0.5px
function SummarySection({ label }) {
  return <div className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-[0.5px]">{label}</div>;
}

// ERP .prc-divider: 1px --border-color (#E2E8F0), margin 4px 0
function Divider() {
  return <div className="border-t border-[#E2E8F0] my-1" />;
}

function Muted({ children }) {
  // ERP renders empty summary values with color:var(--text-muted) (#9CA3AF)
  return <span className="text-[#9CA3AF] font-normal">{children}</span>;
}

function StatusPill({ children }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-[20px] text-[10px] font-semibold bg-emerald-50 text-emerald-700">
      {children}
    </span>
  );
}

export default function PwSidebar({
  form,
  items,
  catCount,
  totals,
  timeline = [],
  files = [],
  record = null,
  onAddFiles,
  onRemoveFile,
  onPreview,
  onPrint,
  onPdf
}) {
  const fileInputRef = useRef(null);

  const handleFileInput = (e) => {
    if (onAddFiles && e.target.files?.length > 0) {
      onAddFiles(e.target.files);
    }
    e.target.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (onAddFiles && e.dataTransfer?.files?.length > 0) {
      onAddFiles(e.dataTransfer.files);
    }
  };

  // ERP create page defaults to 'Pending Approval'; edit mode derives from the
  // loaded backend record (the PW backend persists approval via approvedBy /
  // rejectionReason rather than a dedicated status value).
  const approvalKey = record?.approvedBy ? 'approved' : record?.rejectionReason ? 'rejected' : 'pending';
  const approvalLabel = approvalKey === 'approved' ? 'Approved' : approvalKey === 'rejected' ? 'Rejected' : 'Pending Approval';
  const approvalColor = APPROVAL_COLORS[approvalKey];

  const statusLabel = form.status === 'completed' ? 'Completed' : form.status === 'draft' ? 'Draft' : String(form.status || 'draft');

  return (
    <div>
      {/* ===== DOCUMENT SUMMARY ===== */}
      <SideCard icon={FileText} title="Document Summary" compact maxHeight={380}>
        <div className="flex flex-col gap-1.5">
          <SummarySection>Document</SummarySection>
          <SummaryRow label="Profit Workout No.">{form.pwNo || '-'}</SummaryRow>
          <SummaryRow label="Date">{form.pwDate || '-'}</SummaryRow>
          <SummaryRow label="Status">
            <StatusPill>{statusLabel}</StatusPill>
          </SummaryRow>
          <SummaryRow label="CPR Reference">{form.cprRef || '-'}</SummaryRow>

          <Divider />

          <SummarySection>People</SummarySection>
          <SummaryRow label="Prepared By">{form.preparedBy || '-'}</SummaryRow>
          <SummaryRow label="Department">{form.department || '-'}</SummaryRow>
          <SummaryRow label="Customer">{form.customerName || form.sourceLead || '-'}</SummaryRow>
          <SummaryRow label="Project">{form.project || '-'}</SummaryRow>

          <Divider />

          <SummarySection>Items</SummarySection>
          <SummaryRow label="Items">{items.length}</SummaryRow>
          {typeof catCount === 'number' && <SummaryRow label="Categories">{catCount}</SummaryRow>}
          <SummaryRow label="Attachments">{files.length}</SummaryRow>

          <Divider />

          <SummarySection>Activity</SummarySection>
          <SummaryRow label="Created">{record?.createdAt ? fmtDate(record.createdAt) : '-'}</SummaryRow>
          <SummaryRow label="Last Saved">{record?.updatedAt ? fmtDate(record.updatedAt) : '-'}</SummaryRow>
        </div>
      </SideCard>

      {/* ===== PROFIT SUMMARY ===== */}
      <SideCard icon={Calculator} title="Profit Summary" compact maxHeight={320}>
        <div className="flex flex-col gap-1.5">
          <SummarySection>Totals</SummarySection>
          <SummaryRow label="Total Cost">{formatCurrency(totals.totalCost)}</SummaryRow>
          <SummaryRow label="Total Selling Value">{formatCurrency(totals.totalSelling)}</SummaryRow>
          <SummaryRow
            label="Total Profit"
            style={{ fontWeight: 700 }}
          >
            <span className={totals.totalProfit < 0 ? 'text-rose-600' : 'text-[#0B4A3D]'}>
              {formatCurrency(totals.totalProfit)}
            </span>
          </SummaryRow>
          <SummaryRow
            label="Profit %"
            style={{ fontWeight: 700 }}
          >
            <span className={totals.profitPct < 0 ? 'text-rose-600' : 'text-[#0B4A3D]'}>
              {Number(totals.profitPct).toFixed(2)}%
            </span>
          </SummaryRow>

          <Divider />

          <SummaryRow label="Discount">{formatCurrency(totals.discountAmt)}</SummaryRow>
          <SummaryRow label="Additional Charges">{formatCurrency(totals.chargesAmt)}</SummaryRow>
          <SummaryRow label="GST">{formatCurrency(totals.gstAmt)}</SummaryRow>

          <Divider />

          <SummaryRow label="Grand Total" style={{ fontWeight: 700 }}>
            <span className="text-[#0B4A3D]" style={{ fontSize: 14 }}>
              {formatCurrency(totals.grandTotal)}
            </span>
          </SummaryRow>
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
            <Muted>&mdash;</Muted>
          </SummaryRow>
          <SummaryRow label="Submitted Date">
            <Muted>&mdash;</Muted>
          </SummaryRow>

          <Divider />

          <SummarySection>Decision</SummarySection>
          <SummaryRow label="Approved By">
            {record?.approvedBy ? record.approvedBy : <Muted>&mdash;</Muted>}
          </SummaryRow>
          <SummaryRow label="Approved Date">
            {record?.approvedAt ? fmtDate(record.approvedAt) : <Muted>&mdash;</Muted>}
          </SummaryRow>
          <SummaryRow label="Rejected By">
            <Muted>&mdash;</Muted>
          </SummaryRow>
          <SummaryRow label="Rejected Date">
            <Muted>&mdash;</Muted>
          </SummaryRow>
        </div>
      </SideCard>

      {/* ===== QUICK ACTIONS ===== */}
      <SideCard icon={Zap} title="Quick Actions" compact maxHeight={320}>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onPreview}
            className="flex items-center gap-2 text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg hover:bg-[#E8F0EE] hover:border-[#0B4A3D]/40 transition-colors cursor-pointer w-full"
          >
            <Eye className="w-3.5 h-3.5 text-[#0B4A3D]" /> Preview
          </button>
          <button
            type="button"
            onClick={onPrint}
            className="flex items-center gap-2 text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg hover:bg-[#E8F0EE] hover:border-[#0B4A3D]/40 transition-colors cursor-pointer w-full"
          >
            <Printer className="w-3.5 h-3.5 text-[#0B4A3D]" /> Print
          </button>
          <button
            type="button"
            onClick={onPdf}
            className="flex items-center gap-2 text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg hover:bg-[#E8F0EE] hover:border-[#0B4A3D]/40 transition-colors cursor-pointer w-full"
          >
            <FileDown className="w-3.5 h-3.5 text-[#0B4A3D]" /> Download PDF
          </button>
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
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
          className="hidden"
          onChange={handleFileInput}
        />

        {files.length > 0 && (
          <div className="grid grid-cols-2 gap-2 mt-3">
            {files.map((file, index) => {
              const Icon = fileIcon(file.name);
              const isImg = file.type && file.type.indexOf('image') === 0;
              return (
                <div
                  key={`${file.name}-${index}`}
                  className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2"
                >
                  {isImg && file.data ? (
                    <img src={file.data} alt={file.name} className="w-9 h-9 rounded object-cover shrink-0" />
                  ) : (
                    <Icon className="w-5 h-5 text-[#0B4A3D] shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-semibold text-slate-700 truncate">{file.name}</div>
                    <div className="text-[9px] text-slate-400">{formatBytes(file.size)}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemoveFile?.(index)}
                    aria-label={`Remove ${file.name}`}
                    className="p-1 text-slate-300 hover:text-rose-500 transition-colors cursor-pointer shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </SideCard>

      {/* ===== ACTIVITY TIMELINE ===== */}
      <SideCard icon={History} title="Activity Timeline" compact maxHeight={380}>
        {record?.id && (
          <div className="mb-3 flex flex-col gap-2">
            <EditCountBadge moduleKey="profitWorkout" recordId={record.id} />
            <EditHistoryTimeline moduleKey="profitWorkout" recordId={record.id} limit={5} />
          </div>
        )}
        {timeline.length === 0 ? (
          <div className="text-center py-6">
            <Inbox className="w-6 h-6 text-slate-300 mx-auto mb-2" />
            <p className="text-xs text-slate-400">No activity yet</p>
          </div>
        ) : (
          <div>
            {timeline.map((entry, i) => {
              const Icon = TIMELINE_ICONS[entry.action] || Save;
              return (
                <div
                  key={i}
                  className="flex items-start gap-3 py-3 border-b border-[#f3f4f6] last:border-b-0"
                >
                  <div className="w-8 h-8 rounded-full bg-[#0B4A3D]/10 text-[#0B4A3D] flex items-center justify-center shrink-0">
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-[#1e293b]">{entry.detail}</div>
                    <div className="text-[11px] text-[#9CA3AF] mt-1">{entry.time}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SideCard>
    </div>
  );
}