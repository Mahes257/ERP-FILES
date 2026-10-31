import { useEffect, useState } from 'react';
import { Settings2 } from 'lucide-react';
import { INPUT_BASE } from './FormControls';
import {
  getFlatOptions,
  subscribeDropdownChanges
} from '../../utils/dropdownManager';
import {
  isSettingsBacked,
  getEffectiveEnabledOptions,
  getEffectiveOptions
} from '../../utils/settingsOptions';
import marketingSettingsService from '../../services/marketingSettingsService';
import OptionsManagerModal from './OptionsManagerModal';

/**
 * ManagedSelect — a standard ERP select whose options can be managed from the
 * frontend (Add / Edit / Enable-Disable) via the gear button beside it.
 *
 * Uses the exact same input styling as SelectInput, so the ERP UI is
 * preserved. Options come from dropdownManager (ERP base list + user overlay):
 *  - disabled values are hidden from new selections
 *  - a disabled value that is currently selected keeps displaying
 *    ("… (disabled)") so existing records are never silently changed
 *
 * Props:
 *  - categoryKey : dropdownManager category (e.g. 'lead_priority')
 *  - value       : currently selected value
 *  - onChange    : (value) => void
 *  - label       : field label (used by the management modal title)
 *  - placeholder : text for the empty option (default 'Select...')
 *  - error       : red border + error state
 *  - disabled    : native select disabled state
 *  - emptyOption : render the empty "<Select>" option (default true)
 */
export default function ManagedSelect({
  categoryKey,
  value,
  onChange,
  label,
  placeholder = 'Select...',
  error = false,
  disabled = false,
  emptyOption = true,
  id
}) {
  const [open, setOpen] = useState(false);
  // Version bump = re-render trigger; the value itself is read at render time.
  const [, setVersion] = useState(0);
  const settingsBacked = isSettingsBacked(categoryKey);

  // Settings-backed categories: options live in the database (Marketing
  // Settings). Re-read whenever settings arrive/change. If the fetch fails,
  // marketingSettingsService falls back to defaults, so the list is never empty.
  useEffect(() => {
    if (!settingsBacked) return undefined;
    let cancelled = false;
    marketingSettingsService
      .getSettings()
      .then(() => { if (!cancelled) setVersion((v) => v + 1); })
      .catch(() => { /* defaults already in place */ });
    const unsub = marketingSettingsService.subscribe(() => setVersion((v) => v + 1));
    return () => {
      cancelled = true;
      unsub();
    };
  }, [settingsBacked, categoryKey]);

  // Overlay-backed categories: same-tab + cross-tab reactivity (unchanged).
  useEffect(() => subscribeDropdownChanges(() => setVersion((v) => v + 1)), [categoryKey]);

  // Effective list: Marketing Settings DB for settings categories,
  // dropdownManager overlay for everything else.
  const options = settingsBacked
    ? getEffectiveEnabledOptions(categoryKey)
    : getFlatOptions(categoryKey).filter((o) => o.enabled);
  const all = settingsBacked
    ? getEffectiveOptions(categoryKey)
    : getFlatOptions(categoryKey);
  const currentDisabled = value
    ? all.find((o) => o.value === value && !o.enabled)
    : null;

  return (
    <div className="flex items-stretch gap-1.5">
      <select
        id={id}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label={label || categoryKey}
        className={`${INPUT_BASE} ${error ? 'border-rose-400' : ''} cursor-pointer`}
      >
        {emptyOption && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.value}</option>
        ))}
        {currentDisabled && (
          <option value={currentDisabled.value} disabled>
            {currentDisabled.value} (disabled)
          </option>
        )}
      </select>
      {settingsBacked ? (
        // Marketing options are managed in Marketing Settings (database-backed).
        // The gear button deep-links there instead of opening a local overlay
        // editor that would not persist.
        <button
          type="button"
          title={`Manage ${label || categoryKey} options in Marketing Settings`}
          aria-label={`Manage ${label || categoryKey} options in Marketing Settings`}
          onClick={() => window.location.assign('/marketing/settings')}
          className="shrink-0 flex items-center justify-center px-2.5 border border-slate-200/80 rounded-lg bg-slate-50 text-slate-500 hover:text-[#0B4A3D] hover:bg-[#0B4A3D]/5 hover:border-[#0B4A3D]/30 transition-colors cursor-pointer"
        >
          <Settings2 className="w-3.5 h-3.5" />
        </button>
      ) : (
        <button
          type="button"
          title={`Manage ${label || categoryKey} options`}
          aria-label={`Manage ${label || categoryKey} options`}
          onClick={() => setOpen(true)}
          className="shrink-0 flex items-center justify-center px-2.5 border border-slate-200/80 rounded-lg bg-slate-50 text-slate-500 hover:text-[#0B4A3D] hover:bg-[#0B4A3D]/5 hover:border-[#0B4A3D]/30 transition-colors cursor-pointer"
        >
          <Settings2 className="w-3.5 h-3.5" />
        </button>
      )}
      <OptionsManagerModal
        key={open ? 'open' : 'closed'}
        categoryKey={categoryKey}
        label={label}
        open={open}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}
