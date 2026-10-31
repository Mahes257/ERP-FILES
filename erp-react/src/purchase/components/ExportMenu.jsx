/**
 * purchase/components/ExportMenu.jsx
 * ------------------------------------------------------------------
 * Dropdown with CSV / Excel / Print export actions for Purchase list
 * tables. Delegates to the shared export helpers in utils/export.js.
 * ------------------------------------------------------------------
 */
import { useRef, useState } from 'react';
import { ChevronDown, FileDown, FileSpreadsheet, Loader2, Printer } from 'lucide-react';
import useClickOutside from '../hooks/useClickOutside';
import { exportCsv, exportExcel, printTable } from '../utils/export';

export default function ExportMenu({ columns, records, filename = 'purchase-data', title = 'Purchase Data', getRecords }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);

  useClickOutside(ref, () => setOpen(false), open);

  const run = async (kind) => {
    setOpen(false);
    setBusy(true);
    try {
      let rows = records;
      if (getRecords) {
        try {
          rows = await getRecords();
        } catch {
          rows = records;
        }
      }
      if (kind === 'csv') exportCsv(columns, rows, filename);
      else if (kind === 'excel') await exportExcel(columns, rows, filename);
      else printTable(title, columns, rows);
    } finally {
      setBusy(false);
    }
  };

  const items = [
    { key: 'csv', label: 'Export CSV', icon: FileDown },
    { key: 'excel', label: 'Export Excel', icon: FileSpreadsheet },
    { key: 'print', label: 'Print', icon: Printer }
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        disabled={busy}
        className="flex items-center gap-1.5 h-8 px-3.5 rounded-lg text-xs font-semibold text-[#0B4A3D] bg-transparent border-[1.5px] border-[#0B4A3D] hover:bg-[#0B4A3D] hover:text-white transition-colors cursor-pointer select-none disabled:opacity-50 disabled:cursor-not-allowed"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5 text-slate-400" />} Export
        <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-52 bg-surface border border-slate-200 rounded-xl shadow-lg py-1 z-50 animate-in fade-in zoom-in-95" role="menu">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => run(item.key)}
                className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
              >
                <Icon className="w-3.5 h-3.5 text-slate-400" /> {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
