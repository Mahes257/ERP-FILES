import { useMemo, useRef, useState } from 'react';
import { Columns, Eye, EyeOff, GripVertical, Plus, RotateCcw, Trash2 } from 'lucide-react';
import QtnModal from './QtnModal';
import {
  DEFAULT_COLUMNS,
  evaluateFormula,
  formatMoney,
  isSystemColumn,
  saveColumnConfig
} from '../../utils/quotationGrid';

const TYPE_OPTIONS = [
  { value: 'text', label: 'TEXT' },
  { value: 'number', label: 'NUMBER' },
  { value: 'currency', label: 'CURRENCY' },
  { value: 'computed', label: 'FORMULA' }
];

// Formula presets shown under FORMULA columns (per spec).
const FORMULA_PRESETS = [
  { label: '(Quantity × Rate)', expr: 'qty * rate' },
  { label: '(Amount × GST) / 100', expr: '(netAmt * gstRate) / 100' },
  { label: '(Amount + Tax)', expr: 'netAmt + cgst + sgst' }
];

// Sample row used by the bottom preview bar.
const PREVIEW_VARS = {
  qty: 5,
  rate: 100,
  discountPct: 0,
  gstRate: 18,
  grossAmt: 500,
  discAmt: 0,
  netAmt: 500,
  cgst: 45,
  sgst: 45,
  total: 590
};

const typeLabel = (type) => {
  const found = TYPE_OPTIONS.find((t) => t.value === type);
  return found ? found.label : 'TEXT';
};

let customSeq = 0;
const newKey = () => `custom_${Date.now()}_${++customSeq}`;

/**
 * Customize Columns & Formulas modal (new feature, erp-react only).
 * Design per spec: rows with drag handle, column name textbox, type dropdown
 * (TEXT / NUMBER / CURRENCY / FORMULA), eye show-hide, delete; "+ Add New Column"
 * top-right; formula presets; purple preview bar; Cancel / Reset to Default /
 * Save Changes. Locked structural columns (# and Actions) keep the grid intact.
 */
export default function ColumnsFormulaModal({ open, onClose, columns, onSave, evaluateRow }) {
  const [draft, setDraft] = useState(() => columns.map((c) => ({ ...c })));
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);
  const dragCounter = useRef(0);

  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setDraft(columns.map((c) => ({ ...c })));
      setDragIndex(null);
      setOverIndex(null);
    }
  }

  const set = (idx, patch) => setDraft((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));

  // ---------------- add ----------------
  const addColumn = () => {
    setDraft((prev) => [
      ...prev.slice(0, -1),
      { key: newKey(), label: 'New Column', type: 'text', width: 120, visible: true, locked: false },
      prev[prev.length - 1] // keep Actions last
    ]);
  };

  // ---------------- delete ----------------
  const removeColumn = (idx) => {
    const col = draft[idx];
    if (!col || col.locked || isSystemColumn(col.key)) return;
    setDraft((prev) => prev.filter((_, i) => i !== idx));
  };

  // ---------------- drag & drop reorder ----------------
  const onDragStart = (idx) => {
    dragCounter.current = 0;
    setDragIndex(idx);
  };
  const onDragEnter = (idx) => {
    dragCounter.current += 1;
    setOverIndex(idx);
  };
  const onDragLeave = () => {
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) setOverIndex(null);
  };
  const onDrop = (targetIdx) => {
    const from = dragIndex;
    setDragIndex(null);
    setOverIndex(null);
    if (from == null || from === targetIdx) return;
    const src = draft[from];
    const target = draft[targetIdx];
    // never reorder the locked trailing Actions column
    if (src.locked || target.locked) return;
    setDraft((prev) => {
      const next = [...prev];
      next.splice(from, 1);
      next.splice(targetIdx, 0, src);
      return next;
    });
  };

  // ---------------- helpers ----------------
  const reset = () => setDraft(DEFAULT_COLUMNS.map((c) => ({ ...c })));

  const visibleCount = draft.filter((c) => c.visible).length;
  const anyFormulaErrors = useMemo(
    () => draft.some((c) => c.type === 'computed' && c.formula && evaluateRow(c.formula) === null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft]
  );

  // preview value for a column (dummy sample row)
  const previewValue = (col) => {
    if (col.type === 'index') return '#';
    if (col.type === 'computed') {
      if (col.key === 'amount') return '500.00';
      if (col.key === 'cgst') return '45.00';
      if (col.key === 'sgst') return '45.00';
      if (col.key === 'total') return '590.00';
      if (col.formula) {
        const v = evaluateFormula(col.formula, PREVIEW_VARS);
        return v == null ? '—' : String(Math.round(v * 100) / 100);
      }
      return '—';
    }
    if (col.type === 'currency') return formatMoney(123.5, {});
    if (col.type === 'number') return '123.00';
    return 'Sample';
  };

  const handleSave = () => {
    const cleaned = draft.map((c) => ({
      ...c,
      formula: c.type === 'computed' ? c.formula || '' : undefined
    }));
    saveColumnConfig(cleaned);
    onSave(cleaned);
    onClose();
  };

  return (
    <QtnModal
      open={open}
      onClose={onClose}
      title="Customize Columns & Formulas"
      icon={<Columns size={16} color="#7C3AED" />}
      theme="purple"
      maxWidth={760}
      footer={
        <>
          <button type="button" className="qtn-modal-btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="qtn-modal-btn ghost" onClick={reset}>
            <RotateCcw size={13} /> Reset to Default
          </button>
          <span className="qtn-modal-footer-spacer" />
          <button type="button" className="qtn-modal-btn primary" onClick={handleSave}>
            Save Changes
          </button>
        </>
      }
    >
      <div className="qtn-col-editor">
        <div className="qtn-col-editor-toolbar">
          <span className="qtn-hint">
            Drag rows to reorder · toggle visibility · edit formulas. {visibleCount} of {draft.length} columns visible.
          </span>
          <button type="button" className="qtn-modal-btn add" onClick={addColumn}>
            <Plus size={13} /> Add New Column
          </button>
        </div>

        {anyFormulaErrors && (
          <div className="qtn-col-editor-warn">Some formulas are invalid — they will evaluate to 0 until fixed.</div>
        )}

        <div className="qtn-col-list">
          {draft.map((col, idx) => {
            const locked = col.locked || isSystemColumn(col.key);
            const isFormula = col.type === 'computed';
            return (
              <div
                key={col.key}
                className={`qtn-col-row${locked ? ' locked' : ''}${overIndex === idx && dragIndex != null && dragIndex !== idx ? ' drag-over' : ''}${dragIndex === idx ? ' dragging' : ''}`}
                draggable={!locked}
                onDragStart={() => onDragStart(idx)}
                onDragEnter={() => onDragEnter(idx)}
                onDragLeave={onDragLeave}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(idx)}
                onDragEnd={() => {
                  dragCounter.current = 0;
                  setDragIndex(null);
                  setOverIndex(null);
                }}
              >
                <span className="qtn-col-grip" title={locked ? 'Locked column' : 'Drag to reorder'}>
                  <GripVertical size={14} />
                </span>

                <input
                  type="text"
                  className="qtn-input qtn-col-name"
                  value={col.label}
                  onChange={(e) => set(idx, { label: e.target.value })}
                  placeholder="Column name"
                  disabled={locked}
                  title={locked ? 'System column — cannot be renamed' : 'Column name'}
                />

                <select
                  className="qtn-select qtn-col-type"
                  value={col.type}
                  onChange={(e) => set(idx, { type: e.target.value })}
                  disabled={locked}
                  title={locked ? 'System column — type is fixed' : 'Column type'}
                >
                  {TYPE_OPTIONS.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>

                <button
                  type="button"
                  className={`qtn-col-vis${col.visible ? ' on' : ''}`}
                  title={col.visible ? 'Hide column' : 'Show column'}
                  onClick={() => set(idx, { visible: !col.visible })}
                >
                  {col.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>

                <button
                  type="button"
                  className="qtn-col-btn danger"
                  title={locked ? 'System column — cannot be deleted' : 'Delete column'}
                  onClick={() => removeColumn(idx)}
                  disabled={locked}
                >
                  <Trash2 size={14} />
                </button>

                {isFormula && (
                  <div className="qtn-formula-editor">
                    <input
                      type="text"
                      className="qtn-input mono"
                      value={col.formula || ''}
                      onChange={(e) => set(idx, { formula: e.target.value })}
                      placeholder="Formula — e.g. qty * rate"
                    />
                    <div className="qtn-formula-presets">
                      {FORMULA_PRESETS.map((p) => (
                        <button
                          key={p.expr}
                          type="button"
                          className="qtn-formula-chip"
                          onClick={() => set(idx, { formula: p.expr })}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ===== Purple preview bar ===== */}
        <div className="qtn-col-preview">
          <div className="qtn-col-preview-title">Grid Preview — {visibleCount} columns</div>
          <div className="qtn-col-preview-row">
            {draft.filter((c) => c.visible).map((col) => (
              <span key={col.key} className="qtn-col-preview-chip">
                <b>{col.label}</b>
                <span>{typeLabel(col.type)}</span>
                <em>{previewValue(col)}</em>
              </span>
            ))}
          </div>
        </div>
      </div>
    </QtnModal>
  );
}
