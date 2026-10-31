import { useState, useRef } from 'react';
import { ChevronDown, FileText, FileSpreadsheet, FileDown, Printer } from 'lucide-react';
import useClickOutside from '../../hooks/useClickOutside';
import { useToast } from '../Common';
import { EXPORT_FORMATS, exportLeads, getExportFormat } from '../../services/exportService';

const FORMAT_ICONS = {
  'pdf-summary': FileText,
  'pdf-detailed': FileText,
  excel: FileSpreadsheet,
  csv: FileDown,
  print: Printer
};

const exportItems = EXPORT_FORMATS.map((format) => ({
  key: format.key,
  label: format.label,
  hint: format.hint
}));

const VARIANTS = {
  light: 'bg-surface border border-slate-200 text-slate-600 hover:bg-slate-50',
  dark: 'bg-[#334155] hover:bg-[#475569] text-white border border-[#475569]'
};

export default function ExportDropdown({
  leads = [],
  columns = [],
  filename = 'leads',
  variant = 'light',
  disabled = false,
  buttonLabel = 'Export',
  noun = 'leads'
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const toast = useToast();

  useClickOutside(ref, () => setOpen(false), open);

  const handleExport = async (format) => {
    setOpen(false);
    if (!leads || leads.length === 0) {
      toast.error('No data available to export');
      return;
    }
    const config = getExportFormat(format);
    try {
      await exportLeads(format, leads, columns, filename);
      toast.success(
        format === 'print'
          ? 'Opening printable report...'
          : `Exported ${leads.length} lead(s) as ${config?.label || format}`
      );
    } catch (err) {
      toast.error(err?.message || 'Export failed');
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => !disabled && setOpen((prev) => !prev)}
        className={`flex items-center gap-1.5 text-xs font-bold px-3 py-2.5 rounded-lg transition-colors cursor-pointer select-none ${VARIANTS[variant]} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
      >
        <span>{buttonLabel}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-surface border border-slate-200 rounded-xl shadow-lg py-1 z-50 animate-in fade-in zoom-in-95">
          <div className="px-3 py-2 border-b border-slate-100">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Export ({leads.length} {noun})</div>
          </div>
          {exportItems.map((item) => {
            const Icon = FORMAT_ICONS[item.key];
            return (
              <button
                key={item.key}
                onClick={() => handleExport(item.key)}
                className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2.5 transition-colors cursor-pointer"
              >
                <Icon className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="flex-1">
                  <span className="block text-xs font-semibold text-slate-700">{item.label}</span>
                  <span className="block text-[10px] text-slate-400 font-normal">{item.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
