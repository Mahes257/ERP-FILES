import { useRef, useState } from 'react';
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

const PRIORITY_COLORS = { low: '#6b7280', medium: '#d97706', high: '#dc2626', critical: '#7c3aed' };
const STATUS_COLORS = {
  new: '#0B4A3D', contacted: '#2563eb', qualified: '#7c3aed',
  proposal: '#d97706', won: '#16a34a', lost: '#dc2626'
};

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

function fmtDate(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('en-IN', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
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

function SummaryRow({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs text-[#374151]">
      <span>{label}</span>
      <span className="font-semibold text-[#0B1F1A] text-right">{children}</span>
    </div>
  );
}

function SummarySection({ label }) {
  return <div className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-[0.5px] mb-0.5">{label}</div>;
}

function Divider() {
  return <div className="border-t border-[#E2E8F0] my-1" />;
}

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
  return <span className="text-[#9CA3AF] font-semibold">{children}</span>;
}

export default function LeadSidebar({ form, attachmentFiles = [], onFilesChange }) {
  const fileInputRef = useRef(null);
  const toast = useToast();

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
      onFilesChange?.([...attachmentFiles, ...accepted]);
    }
  };

  const handleFiles = (e) => {
    const list = Array.from(e.target.files || []);
    if (list.length > 0) acceptFiles(list);
    e.target.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const list = Array.from(e.dataTransfer?.files || []);
    if (list.length > 0) acceptFiles(list);
  };

  const removeFile = (index) => {
    onFilesChange?.(attachmentFiles.filter((_, i) => i !== index));
  };

  const priority = (form.priority || '').toLowerCase();
  const stage = (form.stage || '').toLowerCase();
  const status = (form.status || '').toLowerCase();

  return (
    <div>
      {/* ===== LEAD SUMMARY ===== */}
      <SideCard icon={FileText} title="Lead Summary" compact maxHeight={380}>
        <div className="flex flex-col gap-1.5">
          <SummarySection>Document</SummarySection>
          <SummaryRow label="Lead Number">{form.leadNo || '-'}</SummaryRow>
          <SummaryRow label="Source">{form.leadSource || '-'}</SummaryRow>
          <SummaryRow label="Expected Close">{form.expectedCloseDate || '-'}</SummaryRow>

          <Divider />

          <SummarySection>Status</SummarySection>
          <SummaryRow label="Priority">
            {form.priority ? (
              <Badge color={PRIORITY_COLORS[priority] || '#6b7280'}>{form.priority}</Badge>
            ) : (
              '-'
            )}
          </SummaryRow>
          <SummaryRow label="Stage">
            {form.stage ? (
              <Badge color={STATUS_COLORS[stage] || '#6b7280'}>{form.stage}</Badge>
            ) : (
              '-'
            )}
          </SummaryRow>
          <SummaryRow label="Status">
            {form.status ? (
              <Badge color={STATUS_COLORS[status] || '#6b7280'}>{form.status}</Badge>
            ) : (
              '-'
            )}
          </SummaryRow>

          <Divider />

          <SummarySection>Business</SummarySection>
          <SummaryRow label="Business Name">{form.businessName || '-'}</SummaryRow>
          <SummaryRow label="Industry">{form.industry || '-'}</SummaryRow>
          <SummaryRow label="Website">{form.website || '-'}</SummaryRow>

          <Divider />

          <SummarySection>Contact</SummarySection>
          <SummaryRow label="Contact Person">{form.contactPerson || '-'}</SummaryRow>
          <SummaryRow label="Phone">{form.phone || '-'}</SummaryRow>
          <SummaryRow label="Email">{form.email || '-'}</SummaryRow>
          <SummaryRow label="Owner">{form.owner || '-'}</SummaryRow>

          <Divider />

          <SummarySection>Value & Attachments</SummarySection>
          <SummaryRow label="Expected Value">{form.expectedValue ? `₹${Number(form.expectedValue).toLocaleString('en-IN')}` : '-'}</SummaryRow>
          <SummaryRow label="Attachments">{attachmentFiles.length}</SummaryRow>

          <Divider />

          <SummarySection>Activity</SummarySection>
          <SummaryRow label="Created">{fmtDate(new Date().toISOString())}</SummaryRow>
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

        {attachmentFiles.length > 0 && (
          <div className="grid grid-cols-2 gap-2 mt-3">
            {attachmentFiles.map((file, index) => {
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
        {attachmentFiles.length > 0 && (
          <p className="text-[10px] text-slate-400 mt-2">
            {attachmentFiles.length} file(s) queued — will be uploaded after this lead is saved.
          </p>
        )}
      </SideCard>

      {/* ===== ACTIVITY TIMELINE ===== */}
      <SideCard icon={History} title="Activity Timeline" compact maxHeight={360}>
        <div className="text-center py-6">
          <Inbox className="w-6 h-6 text-slate-300 mx-auto mb-2" />
          <p className="text-xs text-slate-400">No activity yet</p>
        </div>
      </SideCard>
    </div>
  );
}
