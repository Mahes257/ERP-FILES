import { Plus, Trash2 } from 'lucide-react';
import { EditableMasterDropdown } from '../Common';

const INPUT_CLS =
  'w-full bg-slate-50 border border-slate-200/80 rounded-lg px-2 py-1.5 text-xs text-slate-700 placeholder-slate-400 outline-none focus:border-emerald-600/50 focus:bg-surface transition-all shadow-inner';

const LABEL_CLS = 'block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1';

/**
 * Packing Details editor for the Export Invoice / Export Proforma forms — a
 * repeatable list of packing entries with Package Type / No. of Packages /
 * Length × Width × Height (auto volume in m³) / Weight / Remarks.
 * The value is an array of
 * { packageType, noOfPackages, length, width, height, volume, weight, packingRemarks }
 * objects stored on the form; the serializer persists it as a JSON TEXT column.
 * Mirrors the ERP input styling and the EditableMasterDropdown used by the rest
 * of the Sales Execution forms.
 */
export default function PackingDetailsEditor({ value, onChange, packageTypes = [] }) {
  const rows = Array.isArray(value) ? value : [];

  const updateRow = (index, patch) => {
    const next = rows.map((r, i) => (i === index ? { ...r, ...patch } : r));
    // Auto-calculate volume (m³) from Length × Width × Height (mm) whenever any
    // dimension changes: 520 × 400 × 300 mm → 0.520 × 0.400 × 0.300 = 0.0624 m³.
    const row = next[index];
    if (row && (patch.length !== undefined || patch.width !== undefined || patch.height !== undefined)) {
      const l = Number(row.length) || 0;
      const w = Number(row.width) || 0;
      const h = Number(row.height) || 0;
      row.volume = l && w && h ? Math.round((l * w * h) / 1000000000 * 10000) / 10000 : '';
    }
    onChange(next);
  };

  const addRow = () => {
    onChange([
      ...rows,
      { packageType: '', noOfPackages: '', length: '', width: '', height: '', volume: '', weight: '', packingRemarks: '' }
    ]);
  };

  const removeRow = (index) => {
    onChange(rows.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      {rows.length === 0 && (
        <div className="text-xs text-slate-400 rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center">
          No packing entries yet — add the package details for this shipment.
        </div>
      )}
      {rows.map((row, idx) => (
        <div key={idx} className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
              Package {idx + 1}
            </span>
            <button
              type="button"
              onClick={() => removeRow(idx)}
              className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-rose-600 hover:bg-rose-50 px-2 py-1 rounded-md transition-colors cursor-pointer"
            >
              <Trash2 className="w-3 h-3" /> Remove
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div>
              <label className={LABEL_CLS}>Package Type</label>
              <EditableMasterDropdown
                masterKey="package_types"
                value={row.packageType || ''}
                onChange={(v) => updateRow(idx, { packageType: v })}
                placeholder={packageTypes[0] || 'Select / type package type'}
                portal
                inputClassName={INPUT_CLS}
              />
            </div>
            <div>
              <label className={LABEL_CLS}>No. of Packages</label>
              <input
                type="number"
                min="0"
                value={row.noOfPackages ?? ''}
                onChange={(e) => updateRow(idx, { noOfPackages: e.target.value })}
                placeholder="e.g. 1"
                className={INPUT_CLS}
              />
            </div>
            <div>
              <label className={LABEL_CLS}>Length (mm)</label>
              <input
                type="number"
                min="0"
                value={row.length ?? ''}
                onChange={(e) => updateRow(idx, { length: e.target.value })}
                placeholder="e.g. 520"
                className={INPUT_CLS}
              />
            </div>
            <div>
              <label className={LABEL_CLS}>Width (mm)</label>
              <input
                type="number"
                min="0"
                value={row.width ?? ''}
                onChange={(e) => updateRow(idx, { width: e.target.value })}
                placeholder="e.g. 400"
                className={INPUT_CLS}
              />
            </div>
            <div>
              <label className={LABEL_CLS}>Height (mm)</label>
              <input
                type="number"
                min="0"
                value={row.height ?? ''}
                onChange={(e) => updateRow(idx, { height: e.target.value })}
                placeholder="e.g. 300"
                className={INPUT_CLS}
              />
            </div>
            <div>
              <label className={LABEL_CLS}>Weight (KGS)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={row.weight ?? ''}
                onChange={(e) => updateRow(idx, { weight: e.target.value })}
                placeholder="e.g. 96.03"
                className={INPUT_CLS}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            <div>
              <label className={LABEL_CLS}>Dimensions (L × W × H)</label>
              <input
                type="text"
                value={row.dimensions || ''}
                onChange={(e) => updateRow(idx, { dimensions: e.target.value })}
                placeholder="e.g. 520 × 400 × 300 mm"
                className={INPUT_CLS}
              />
            </div>
            <div>
              <label className={LABEL_CLS}>Total Volume (m³) — auto</label>
              <input
                type="text"
                value={row.volume != null && row.volume !== '' ? `${Number(row.volume).toFixed(4)} m³` : ''}
                readOnly
                placeholder="0.0624 m³"
                className={`${INPUT_CLS} bg-slate-100 text-slate-500 cursor-not-allowed`}
              />
            </div>
          </div>
          <div className="mt-3">
            <label className={LABEL_CLS}>Packing Remarks</label>
            <input
              type="text"
              value={row.packingRemarks || ''}
              onChange={(e) => updateRow(idx, { packingRemarks: e.target.value })}
              placeholder="Package type"
              className={INPUT_CLS}
            />
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={addRow}
        className="flex items-center gap-1.5 text-xs font-bold text-[#0B4A3D] bg-[#E8F0EE] hover:bg-[#D7E7E3] px-3 py-2 rounded-lg transition-colors cursor-pointer"
      >
        <Plus className="w-3.5 h-3.5" /> Add Package
      </button>
    </div>
  );
}