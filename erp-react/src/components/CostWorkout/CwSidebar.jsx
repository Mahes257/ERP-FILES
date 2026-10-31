import { useState } from 'react';
import {
  Calculator,
  CheckCircle2,
  ChevronDown,
  FileText,
  History,
  Inbox,
  PlusCircle,
  Save,
  Send
} from 'lucide-react';

import EditHistoryTimeline from '../EditHistory/EditHistoryTimeline';
import EditCountBadge from '../EditHistory/EditCountBadge';

// ERP _setApprovalDisplay colors (colored text, not a pill)
const APPROVAL_COLORS = { approved: '#16a34a', rejected: '#dc2626', returned: '#d97706', pending: '#9ca3af' };

// ERP cw-create.js _addTimelineEntry icon mapping (fa-plus-circle / fa-save / fa-paper-plane)
const TIMELINE_ICONS = { created: PlusCircle, saved: Save, submitted: Send };

function formatCurrency(amount) {
  return '₹' + Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

export default function CwSidebar({ form, items, catCount, totals, timeline = [], record = null }) {
  // ERP create page defaults to 'Pending Approval'; edit mode derives from the
  // loaded backend record (the CW backend persists approval via approvedBy /
  // rejectionReason rather than a dedicated status value).
  const approvalKey = record?.approvedBy ? 'approved' : record?.rejectionReason ? 'rejected' : 'pending';
  const approvalLabel = approvalKey === 'approved' ? 'Approved' : approvalKey === 'rejected' ? 'Rejected' : 'Pending Approval';
  const approvalColor = APPROVAL_COLORS[approvalKey];

  return (
    <div>
      {/* ===== DOCUMENT SUMMARY ===== */}
      <SideCard icon={FileText} title="Document Summary" compact maxHeight={380}>
        <div className="flex flex-col gap-1.5">
          <SummarySection>Document</SummarySection>
          {/* No document number is listed here. The CW number is the record's
              internal identity (routes, revisions, payloads) and is not a
              user-facing field of a Cost Workout. */}
          <SummaryRow label="Date">{form.cwDate || '-'}</SummaryRow>

          <Divider />

          <SummarySection>Status</SummarySection>
          <SummaryRow label="Status">{form.status === 'completed' ? 'Completed' : 'Draft'}</SummaryRow>

          <Divider />

          <SummarySection>People</SummarySection>
          <SummaryRow label="Prepared By">{form.preparedBy || '-'}</SummaryRow>
          <SummaryRow label="Customer">{form.customerName || '-'}</SummaryRow>
          <SummaryRow label="Company">{form.company || '-'}</SummaryRow>

          <Divider />

          <SummarySection>Items</SummarySection>
          <SummaryRow label="Items">{items.length}</SummaryRow>
          <SummaryRow label="Categories">{catCount}</SummaryRow>
          <SummaryRow label="Total Cost">{formatCurrency(totals.subtotal)}</SummaryRow>

          <Divider />

          <SummarySection>Activity</SummarySection>
          <SummaryRow label="Created">{record?.createdAt ? fmtDate(record.createdAt) : '-'}</SummaryRow>
          <SummaryRow label="Last Saved">{record?.updatedAt ? fmtDate(record.updatedAt) : '-'}</SummaryRow>
        </div>
      </SideCard>

      {/* ===== COST SUMMARY ===== */}
      <SideCard icon={Calculator} title="Cost Summary" compact maxHeight={320}>
        <div className="flex flex-col gap-1.5">
          <SummarySection>Totals</SummarySection>
          <SummaryRow label="Subtotal">{formatCurrency(totals.subtotal)}</SummaryRow>
          <SummaryRow label="Profit">{formatCurrency(totals.profitAmt)}</SummaryRow>
          <SummaryRow label="Discount">{formatCurrency(totals.discountAmt)}</SummaryRow>
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
          <SummaryRow label="Date">
            <Muted>&mdash;</Muted>
          </SummaryRow>

          <Divider />

          <SummarySection>Decision</SummarySection>
          <SummaryRow label="Approved By">
            {record?.approvedBy ? record.approvedBy : <Muted>&mdash;</Muted>}
          </SummaryRow>
          <SummaryRow label="Date">
            {record?.approvedAt ? fmtDate(record.approvedAt) : <Muted>&mdash;</Muted>}
          </SummaryRow>
          <SummaryRow label="Rejected By">
            <Muted>&mdash;</Muted>
          </SummaryRow>
          <SummaryRow label="Date">
            <Muted>&mdash;</Muted>
          </SummaryRow>
        </div>
      </SideCard>

      {/* ===== ACTIVITY TIMELINE ===== */}
      <SideCard icon={History} title="Activity Timeline" compact maxHeight={380}>
        {record?.id && (
          <div className="mb-3 flex flex-col gap-2">
            <EditCountBadge moduleKey="costWorkout" recordId={record.id} />
            <EditHistoryTimeline moduleKey="costWorkout" recordId={record.id} limit={5} />
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
