import { useMemo, useState } from 'react';
import { Coins } from 'lucide-react';
import QtnModal from './QtnModal';
import { EditableMasterDropdown } from '../Common';
import {
  DECIMAL_DIGIT_OPTIONS,
  DEFAULT_NUMBER_SETTINGS,
  NUMBER_SYSTEM_OPTIONS,
  SAMPLE_NUMBER,
  effectiveCurrencySymbol,
  effectivePrecision,
  formatMoney,
  formatSampleNumber,
  getNumberSystemLocale
} from '../../utils/quotationGrid';

/**
 * Number and Currency Format modal (new feature, erp-react only).
 * Design per spec: Change Number Systems radios, Select Decimal Digits,
 * round-off checkboxes, custom currency symbol textbox, purple Save Changes.
 */
export default function NumberCurrencyModal({ open, onClose, settings, onSave }) {
  const [draft, setDraft] = useState(() => ({ ...DEFAULT_NUMBER_SETTINGS, ...settings }));

  // Re-sync draft when the modal opens with different settings.
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setDraft({ ...DEFAULT_NUMBER_SETTINGS, ...settings });
  }

  const set = (key, value) => setDraft((prev) => ({ ...prev, [key]: value }));

  const preview = useMemo(() => formatMoney(SAMPLE_NUMBER, draft), [draft]);
  const locale = getNumberSystemLocale(draft);
  const precision = effectivePrecision(draft);
  const symbol = effectiveCurrencySymbol(draft);

  const handleSave = () => {
    onSave({ ...DEFAULT_NUMBER_SETTINGS, ...draft });
    onClose();
  };

  return (
    <QtnModal
      open={open}
      onClose={onClose}
      title="Number and Currency Format"
      icon={<Coins size={16} color="#7C3AED" />}
      theme="purple"
      footer={
        <>
          <button type="button" className="qtn-modal-btn ghost" onClick={onClose}>
            Cancel
          </button>
          <span className="qtn-modal-footer-spacer" />
          <button type="button" className="qtn-modal-btn primary" onClick={handleSave}>
            Save Changes
          </button>
        </>
      }
    >
      <div className="qtn-num-settings">
        {/* ===== Change Number Systems ===== */}
        <div className="qtn-num-section">
          <div className="qtn-num-section-title">Change Number Systems</div>
          <div className="qtn-num-radios">
            {NUMBER_SYSTEM_OPTIONS.map((sys) => (
              <label
                key={sys.value}
                className={`qtn-num-radio${draft.numberSystem === sys.value ? ' selected' : ''}`}
              >
                <input
                  type="radio"
                  name="qtnNumSystem"
                  value={sys.value}
                  checked={draft.numberSystem === sys.value}
                  onChange={() => set('numberSystem', sys.value)}
                />
                <span className="qtn-num-radio-sample">{formatSampleNumber(sys, draft)}</span>
                <span className="qtn-num-radio-title">{sys.title}</span>
                <span className="qtn-num-radio-tag">({sys.tag})</span>
              </label>
            ))}
          </div>
          {draft.numberSystem === 'Other' && (
            <div className="qtn-num-country">
              <label htmlFor="qtnNumCountry">Country</label>
              <EditableMasterDropdown
                id="qtnNumCountry"
                masterKey="countries"
                inputClassName="qtn-input"
                value={draft.country}
                placeholder="Select country"
                onChange={(v) => set('country', v)}
              />
            </div>
          )}
        </div>

        {/* ===== Select Decimal Digits ===== */}
        <div className="qtn-num-section">
          <div className="qtn-num-section-title">Select Decimal Digits</div>
          <div className="qtn-num-decimal-grid">
            {DECIMAL_DIGIT_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`qtn-num-decimal${draft.decimalDigits === opt.value ? ' selected' : ''}`}
              >
                <input
                  type="radio"
                  name="qtnNumDecimals"
                  value={opt.value}
                  checked={draft.decimalDigits === opt.value}
                  onChange={() => set('decimalDigits', opt.value)}
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* ===== Apply Round-off ===== */}
        <div className="qtn-num-section">
          <div className="qtn-num-section-title">Apply Round-off</div>
          <label className="qtn-num-check">
            <input
              type="checkbox"
              checked={draft.roundOffQty}
              onChange={(e) => set('roundOffQty', e.target.checked)}
            />
            Apply Round-off to Quantity
          </label>
          <label className="qtn-num-check">
            <input
              type="checkbox"
              checked={draft.roundOffRate}
              onChange={(e) => set('roundOffRate', e.target.checked)}
            />
            Apply Round-off to Rate
          </label>
        </div>

        {/* ===== Custom Currency Symbol ===== */}
        <div className="qtn-num-section">
          <div className="qtn-num-section-title">Custom Currency Symbol</div>
          <input
            type="text"
            className="qtn-input"
            value={draft.customCurrencySymbol}
            onChange={(e) => set('customCurrencySymbol', e.target.value)}
            placeholder="Add Custom Currency Symbol (e.g. ₹, $, €)"
            maxLength={8}
          />
        </div>

        {/* ===== Live preview ===== */}
        <div className="qtn-num-preview">
          <div className="qtn-num-preview-label">Preview</div>
          <div className="qtn-num-preview-value">{preview}</div>
          <div className="qtn-num-preview-meta">
            {locale} · {precision} decimal{precision !== 1 ? 's' : ''} · symbol &quot;{symbol}&quot;
          </div>
        </div>
      </div>
    </QtnModal>
  );
}
