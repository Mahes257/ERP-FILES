import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ExternalLink, Info, Layers, Search, StickyNote, Users } from 'lucide-react';
import { Accordion, EditableMasterDropdown, FormField, SelectInput, TextArea, TextInput } from '../Common';
import useClickOutside from '../../hooks/useClickOutside';
import leadService from '../../services/leadService';
import CprItemGrid from './CprItemGrid';
import {
  addDaysToDate,
  deriveExtendedDeadlineOption,
  effectiveQuotationDeadline,
  EXTENDED_DEADLINE_OPTIONS,
  STATUS_OPTIONS
} from '../../utils/cprHelpers';
import { formatDate } from '../../utils/leadHelpers';
import { notesDisplayText } from '../../utils/leadNotes';

// Master dropdowns (department / priority / requested by) are now loaded from
// the backend `master_values` table via EditableMasterDropdown (search, add,
// edit, delete). No hardcoded arrays, no localStorage.

const GRID = 'grid grid-cols-1 sm:grid-cols-2 gap-4';

function pageRows(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.content)) return response.content;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.data?.content)) return response.data.content;
  return [];
}

const INPUT_CLS =
  'w-full bg-slate-50 border border-slate-200/80 rounded-lg px-3 py-2 text-xs text-slate-700 placeholder-slate-400 outline-none focus:border-emerald-600/50 focus:bg-surface transition-all shadow-inner';
const INPUT_CLS_INVALID =
  'w-full bg-slate-50 border border-rose-400 rounded-lg px-3 py-2 text-xs text-slate-700 placeholder-slate-400 outline-none focus:border-rose-500 focus:bg-surface transition-all shadow-inner';

// Module-level store of previously-typed combobox values per collection key.
// Mirrors the ERP combobox autoCreate behaviour: typed values are remembered
// and offered as suggestions the next time the same field is used.
const rememberedStore = new Map(); // key -> Set<string>

/**
 * Searchable "Type or Select" combobox (matches the original ERP VT.ComboBox):
 *  - type any value (auto-created / remembered for next time) or pick an option
 *  - options come from the master list merged with remembered typed values
 *  - dropdown hides when there are no matching options (like the ERP)
 *  - arrow keys navigate, Enter selects / commits, Escape closes
 */
function TypeOrSelect({ value, onChange, options = [], rememberKey, placeholder = 'Type or select...', invalid = false, portal = false }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(-1);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const [pos, setPos] = useState(null);

  useClickOutside(wrapRef, () => setOpen(false), open);

  // Portal positioning — the Status dropdown must render above all cards (the
  // General Information Accordion has overflow-hidden, which clips an inline
  // absolute list). Same fixed-portal mechanism as EditableMasterDropdown.
  const positionDd = () => {
    const input = inputRef.current;
    if (!input) return;
    const rect = input.getBoundingClientRect();
    let left = Math.max(8, rect.left);
    if (left + rect.width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - rect.width - 8);
    }
    const spaceBelow = window.innerHeight - rect.bottom;
    const ddHeight = 224;
    // 4px gap mirrors the inline list's `mt-1` (also kept when flipping above).
    const top = spaceBelow < ddHeight && rect.top > ddHeight ? rect.top - ddHeight - 4 : rect.bottom + 4;
    const maxHeight = spaceBelow < ddHeight && rect.top > ddHeight ? Math.min(224, rect.top - 16) : Math.min(224, spaceBelow - 16);
    setPos({ left, width: rect.width, top, maxHeight });
  };

  useEffect(() => {
    if (!open || !portal) return;
    positionDd();
    const onScroll = () => positionDd();
    const onResize = () => positionDd();
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, portal]);

  const allOptions = useMemo(() => {
    const remembered = rememberKey ? Array.from(rememberedStore.get(rememberKey) || []) : [];
    return [...new Set([...options, ...remembered])];
  }, [options, rememberKey]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allOptions;
    return allOptions.filter((opt) => String(opt).toLowerCase().includes(q));
  }, [allOptions, query]);

  const remember = (val) => {
    const v = (val || '').trim();
    if (!rememberKey || !v) return;
    if (!rememberedStore.has(rememberKey)) rememberedStore.set(rememberKey, new Set());
    const set = rememberedStore.get(rememberKey);
    set.add(v);
    // Cap per-key growth (keep the most recent values) so a long-lived session
    // does not accumulate unbounded entries.
    if (set.size > 50) {
      const trimmed = Array.from(set).slice(-50);
      rememberedStore.set(rememberKey, new Set(trimmed));
    }
  };

  const commit = (val) => {
    const v = (val || '').trim();
    if (v) remember(v);
    onChange(v);
    setQuery('');
    setOpen(false);
    setHighlight(-1);
  };

  const select = (opt) => commit(opt);

  const onKeyDown = (e) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        setOpen(true);
        e.preventDefault();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => (h < filtered.length - 1 ? h + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => (h > 0 ? h - 1 : filtered.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlight >= 0 && filtered[highlight]) {
        select(filtered[highlight]);
      } else {
        commit(query);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      setHighlight(-1);
    } else if (e.key === 'Tab') {
      if (highlight >= 0 && filtered[highlight]) select(filtered[highlight]);
      else commit(query);
    }
  };

  const renderOptions = () =>
    filtered.map((opt, i) => (
      <button
        key={opt}
        type="button"
        // Select on mousedown + preventDefault so the input never blurs
        // first (mirrors the ERP combobox and avoids a blur-commit race).
        onMouseDown={(e) => {
          e.preventDefault();
          select(opt);
        }}
        onClick={() => select(opt)}
        onMouseEnter={() => setHighlight(i)}
        className={`w-full text-left px-3 py-2 text-xs font-medium text-slate-700 border-b border-slate-100 last:border-b-0 transition-colors cursor-pointer ${
          i === highlight ? 'bg-[#0B4A3D]/10 text-[#0B4A3D]' : 'hover:bg-slate-50'
        }`}
      >
        {opt}
      </button>
    ));

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={open ? query : value || ''}
          onChange={(e) => {
            const v = e.target.value;
            setQuery(v);
            setOpen(true);
            setHighlight(-1);
            // Commit typed text immediately so any value can be entered manually
            // (mirrors the ERP combobox syncSelect).
            onChange(v);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          onBlur={() => {
            // Commit any typed value on blur (ERP commits on blur too).
            if (query.trim() && query.trim() !== (value || '')) commit(query);
            else setOpen(false);
          }}
          placeholder={placeholder}
          aria-label={placeholder}
          // Browser autofill must never seed these ERP fields — the value is owned
          // by React state and only the user (or the lead/client auto-fill) sets it.
          autoComplete="off"
          name={rememberKey ? `cpr-${rememberKey}` : undefined}
          className={invalid ? INPUT_CLS_INVALID : INPUT_CLS}
        />
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
      </div>
      {open && filtered.length > 0 &&
        (portal
          ? createPortal(
              <div
                className="fixed z-[9999] bg-surface border border-slate-200 rounded-lg shadow-lg overflow-y-auto"
                style={{
                  left: pos?.left,
                  width: pos?.width,
                  top: pos?.top,
                  maxHeight: pos?.maxHeight,
                  display: pos ? 'block' : 'none'
                }}
                onMouseDown={(e) => e.preventDefault()}
              >
                {renderOptions()}
              </div>,
              document.body
            )
          : <div className="absolute left-0 right-0 top-full mt-1 z-40 max-h-56 overflow-y-auto bg-surface border border-slate-200 rounded-lg shadow-lg">{renderOptions()}</div>)}
    </div>
  );
}

/**
 * Searchable "type-or-select" combobox for Lead / Client (matches the original
 * ERP's custom source-lead selector): options show the name plus "Lead No: <code>"
 * or "Client Code: <code>", and selecting one auto-fills the client details and
 * records the real source identity (type + id) used for validation.
 */
function LeadClientCombobox({ value, onChange, onSelect, onClear, prefillId, prefillType }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const [pos, setPos] = useState(null);
  const selectedRef = useRef(false);
  const prefillDoneRef = useRef(false);

  useClickOutside(wrapRef, () => setOpen(false), open);

  // Portal positioning — the Lead / Client Information Accordion has
  // overflow-hidden, so the option list is mounted through a fixed-position
  // portal (same mechanism as TypeOrSelect above) and can never be clipped.
  const positionDd = () => {
    const input = inputRef.current;
    if (!input) return;
    const rect = input.getBoundingClientRect();
    let left = Math.max(8, rect.left);
    if (left + rect.width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - rect.width - 8);
    }
    const spaceBelow = window.innerHeight - rect.bottom;
    const ddHeight = 256;
    const top = spaceBelow < ddHeight && rect.top > ddHeight ? rect.top - ddHeight - 4 : rect.bottom + 4;
    const maxHeight = spaceBelow < ddHeight && rect.top > ddHeight ? Math.min(ddHeight, rect.top - 16) : Math.min(ddHeight, spaceBelow - 16);
    setPos({ left, width: rect.width, top, maxHeight });
  };

  useEffect(() => {
    if (!open) return undefined;
    positionDd();
    const onScroll = () => positionDd();
    const onResize = () => positionDd();
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [leadsRes, clientsRes] = await Promise.all([
          leadService.listLeads({ page: 0, size: 500 }),
          leadService.listClients({ page: 0, size: 500 })
        ]);
        if (cancelled) return;
        const toOption = (item, type) => {
          const name =
            type === 'lead'
              ? item.company || item.name || item.businessName || '(No Name)'
              : item.businessName || item.company || item.name || '(No Name)';
          const code = String(item.id ?? item.leadNo ?? item.clientCode ?? '');
          return {
            type,
            id: item.id,
            name,
            code,
            value: `${type}:${item.id}`,
            label: `${name} (${type === 'lead' ? `Lead No: ${code}` : `Client Code: ${code}`})`,
            searchText: `${name} ${item.company || item.businessName || ''} ${code}`.toLowerCase(),
            data: item
          };
        };
        const leadOptions = pageRows(leadsRes).map((l) => toOption(l, 'lead'));
        const clientOptions = pageRows(clientsRes).map((c) => toOption(c, 'client'));
        setOptions([...leadOptions, ...clientOptions]);
        // Deep-linked from the Lead actions menu (Create CPR): pre-select the
        // lead through the real selection path so the source identity stays in
        // sync (clearing the combobox then clears sourceType/sourceId too).
        if (prefillId && !prefillDoneRef.current && !cancelled) {
          const leadOpt = [...leadOptions, ...clientOptions].find(
            (o) =>
              String(o.id) === String(prefillId) &&
              (!prefillType || o.type === prefillType)
          );
          if (leadOpt) {
            prefillDoneRef.current = true;
            setQuery('');
            setOpen(false);
            setHighlight(-1);
            selectedRef.current = true;
            onChange(leadOpt.name);
            onSelect?.(leadOpt);
          }
        }
      } catch {
        // lookups are optional; manual entry still works
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillId, prefillType]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.searchText.includes(q));
  }, [options, query]);

  const select = (opt) => {
    setQuery('');
    setOpen(false);
    setHighlight(-1);
    selectedRef.current = true;
    onChange(opt.name);
    onSelect?.(opt);
  };

  const clearSelection = () => {
    if (selectedRef.current) {
      selectedRef.current = false;
      onClear?.();
    }
  };

  const onKeyDown = (e) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        setOpen(true);
        e.preventDefault();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => (h < filtered.length - 1 ? h + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => (h > 0 ? h - 1 : filtered.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlight >= 0 && filtered[highlight]) select(filtered[highlight]);
      setOpen(false);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      setHighlight(-1);
    } else if (e.key === 'Tab') {
      if (highlight >= 0 && filtered[highlight]) select(filtered[highlight]);
      setOpen(false);
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={open ? query : value || ''}
          onChange={(e) => {
            const v = e.target.value;
            setQuery(v);
            setOpen(true);
            setHighlight(-1);
            // The ERP clears the source selection when the input is emptied.
            if (v === '') clearSelection();
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          onBlur={() => setOpen(false)}
          placeholder="Search Lead or Client..."
          aria-label="Lead / Client"
          className={INPUT_CLS}
        />
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
      </div>
      {open &&
        createPortal(
          <div
            className="fixed z-[9999] bg-surface border border-slate-200 rounded-lg shadow-lg overflow-y-auto"
            style={{
              left: pos?.left,
              width: pos?.width,
              top: pos?.top,
              maxHeight: pos?.maxHeight,
              display: pos ? 'block' : 'none'
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              // Keep list clicks from hitting the click-outside handler,
              // matching the inline list behaviour.
              e.stopPropagation();
            }}
          >
            {!loaded && <div className="px-3 py-2.5 text-xs text-slate-400">Loading leads &amp; clients...</div>}
            {loaded && filtered.length === 0 && <div className="px-3 py-2.5 text-xs text-slate-400">No matches found</div>}
            {filtered.map((opt, i) => (
              <button
                key={opt.value}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  select(opt);
                }}
                onClick={() => select(opt)}
                onMouseEnter={() => setHighlight(i)}
                className={`w-full text-left px-3 py-2 border-b border-slate-100 last:border-b-0 transition-colors cursor-pointer ${
                  i === highlight ? 'bg-[#0B4A3D]/10' : 'hover:bg-slate-50'
                }`}
              >
                <span className="block text-xs font-semibold text-slate-700">{opt.name}</span>
                <span className="block text-[10px] text-slate-400">
                  {opt.type === 'lead' ? `Lead No: ${opt.code}` : `Client Code: ${opt.code}`}
                </span>
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}

function joinAddress(parts) {
  return (parts || []).filter(Boolean).join(', ');
}

export default function CprForm({ form, setField, items, setItems, gridRef, errors = {}, prefillLeadId, prefillClientId, onAddNewClient, onEnsureSaved, hideCostColumns = false, itemLabelOverrides = null }) {
  const err = (key) => errors[key] || '';

  // Quotation Deadline + Extended Deadline: the original deadline is preserved
  // in form.quotationDeadline and the effective (possibly extended) deadline in
  // form.extendedDeadline ('' = no extension). The dropdown option is derived
  // from the stored dates so editing never loses the saved value — but the
  // user's explicit choice is remembered in local state so "Custom Date" stays
  // selected instead of snapping back to the derived preset.
  const [extOptionOverride, setExtOptionOverride] = useState(null);
  const extOption = extOptionOverride ?? deriveExtendedDeadlineOption(form.quotationDeadline, form.extendedDeadline);
  const effectiveDeadline = effectiveQuotationDeadline(form.quotationDeadline, form.extendedDeadline);
  const handleExtensionChange = (value) => {
    setExtOptionOverride(value);
    if (value === 'NONE') {
      setField('extendedDeadline', '');
      return;
    }
    if (value === 'CUSTOM') {
      // Keep the current value — the custom date picker appears below.
      return;
    }
    const days = Number(String(value).replace('+', '')) || 0;
    setField('extendedDeadline', addDaysToDate(form.quotationDeadline, days));
  };
  // If the original Quotation Deadline changes (typed/picked again), re-derive
  // the dropdown so preset extensions follow the new base date.
  const handleQuotationDeadlineChange = (value) => {
    setExtOptionOverride(null);
    setField('quotationDeadline', value);
  };

  // Mirrors the original ERP's _autoFillFromLead / _autoFillFromClient exactly,
  // and records the real source identity (type + id) for validation parity.
  const handleSourceSelect = (opt) => {
    const d = opt.data || {};
    setField('sourceType', opt.type);
    setField('sourceId', String(opt.id ?? ''));
    setField('sourceLead', opt.name);
    if (opt.type === 'lead') {
      setField('clientName', d.company || d.name || d.businessName || '');
      setField('contactPerson', d.contactPerson || d.name || '');
      setField('phone', d.phone || d.mobile || '');
      setField('email', d.email || '');
      setField('company', d.company || '');
      setField('gst', d.gst || d.gstin || '');
      setField('pan', d.pan || d.panNumber || '');
      setField('vendor', d.preferredVendor || d.vendor || '');
      setField('leadNo', d.leadNo || d.id || '');
      const address = joinAddress([d.address, d.city, d.state, d.country]);
      setField('billingAddress', address);
      setField('shippingAddress', address);
      // NB: the ERP fell back to lead.notes here, but in the React backend
      // `notes` is a List<NoteResponse> (array) — assigning it makes the
      // payload send an array for a String field and the backend rejects it
      // ("Cannot deserialize value of type String from Array value"). The
      // string equivalent of the ERP's notes is internalNotes.
      // The lead's notes column can hold a legacy CRM metadata envelope:
      // only the written text belongs in Project, never the raw JSON.
      setField('project', d.project || notesDisplayText(d.internalNotes) || '');
      if (d.department) setField('department', d.department);
    } else {
      // Clients are WON-stage leads in the backend, so they share the same
      // LeadResponse fields. Auto-fill mirrors the original _autoFillFromClient.
      setField('clientName', d.businessName || d.companyName || d.clientName || d.name || '');
      setField('contactPerson', d.contactPerson || d.primaryContact || d.contactName || d.name || '');
      setField('phone', d.phone || d.mobile || '');
      setField('email', d.email || '');
      setField('company', d.companyName || d.businessName || '');
      setField('gst', d.gstin || d.gst || '');
      setField('pan', d.pan || d.panNumber || '');
      setField('vendor', d.preferredVendor || d.vendor || '');
      const billing = joinAddress([d.billingStreet || d.address, d.billingCity || d.city, d.billingState || d.state, d.billingCountry || d.country]);
      const shipping =
        joinAddress([
          d.shippingStreet || d.billingStreet || d.address,
          d.shippingCity || d.billingCity || d.city,
          d.shippingState || d.billingState || d.state,
          d.shippingCountry || d.billingCountry || d.country
        ]) || billing;
      setField('billingAddress', billing);
      setField('shippingAddress', shipping);
      setField('project', d.industry || d.project || '');
      // The ERP leaves Lead No empty for clients.
      setField('leadNo', '');
    }
  };

  const handleSourceClear = () => {
    setField('sourceType', '');
    setField('sourceId', '');
  };

  return (
    <div className="space-y-4">
      {/* ===== CARD 1: GENERAL INFORMATION ===== */}
      <Accordion title="General Information" icon={Info} defaultOpen>
        <div className={GRID}>
          <FormField label="PR Number" error={err('prNo')}>
            <TextInput
              value={form.prNo}
              onChange={(e) => setField('prNo', e.target.value)}
              placeholder="Auto-generated or enter manually"
              error={Boolean(err('prNo'))}
            />
          </FormField>
          <FormField label="Date" required error={err('prDate')}>
            <TextInput type="date" value={form.prDate} onChange={(e) => setField('prDate', e.target.value)} error={Boolean(err('prDate'))} />
          </FormField>
          <FormField label="Department" required error={err('department')}>
            <EditableMasterDropdown
              masterKey="pr_departments"
              value={form.department}
              onChange={(v) => setField('department', v)}
              placeholder="Type or select department..."
              invalid={Boolean(err('department'))}
              portal
            />
          </FormField>
          <FormField label="Requested By" required error={err('requestedBy')}>
            <EditableMasterDropdown
              masterKey="pr_requested_by"
              value={form.requestedBy}
              onChange={(v) => setField('requestedBy', v)}
              placeholder="Type requester name..."
              invalid={Boolean(err('requestedBy'))}
              portal
            />
          </FormField>
          <FormField label="Required Date" required error={err('requiredDate')}>
            <TextInput type="date" value={form.requiredDate} onChange={(e) => setField('requiredDate', e.target.value)} error={Boolean(err('requiredDate'))} />
          </FormField>
          <FormField label="Priority" required error={err('priority')}>
            <EditableMasterDropdown
              masterKey="pr_priorities"
              value={form.priority}
              onChange={(v) => setField('priority', v)}
              placeholder="Type or select priority..."
              invalid={Boolean(err('priority'))}
              portal
            />
          </FormField>
          <FormField label="Status">
            <TypeOrSelect
              value={form.status}
              onChange={(v) => setField('status', v)}
              options={STATUS_OPTIONS}
              rememberKey="pr_statuses"
              placeholder="Type or select status..."
              portal
            />
          </FormField>
          <FormField label="Reference No" error={err('referencePrNo')} hint="Must be unique — one Reference No per CPR">
            <TextInput
              value={form.referencePrNo || ''}
              onChange={(e) => setField('referencePrNo', e.target.value)}
              placeholder="Reference No"
              error={Boolean(err('referencePrNo'))}
            />
          </FormField>
          <FormField label="Quotation Deadline">
            <TextInput
              type="date"
              value={form.quotationDeadline || ''}
              onChange={(e) => handleQuotationDeadlineChange(e.target.value)}
            />
          </FormField>
          <FormField label="Extended Deadline" hint="Extends the quotation deadline without changing the original">
            <SelectInput value={extOption} onChange={(e) => handleExtensionChange(e.target.value)} aria-label="Extended Deadline">
              {EXTENDED_DEADLINE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </SelectInput>
          </FormField>
          {extOption === 'CUSTOM' && (
            <FormField label="Custom Extended Date">
              <TextInput
                type="date"
                value={form.extendedDeadline || ''}
                onChange={(e) => setField('extendedDeadline', e.target.value)}
              />
            </FormField>
          )}
          <div className="col-span-2">
            <div className="flex items-center justify-between gap-3 rounded-lg bg-[#E8F0EE] border border-[#0B4A3D]/20 px-3 py-2">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Effective Quotation Deadline</span>
              <span className="text-xs font-bold text-[#0B4A3D]">
                {effectiveDeadline ? formatDate(effectiveDeadline) : 'Not set'}
                {form.extendedDeadline && form.quotationDeadline && form.extendedDeadline !== form.quotationDeadline && (
                  <span className="text-[10px] font-semibold text-slate-400 ml-1.5">(from {formatDate(form.quotationDeadline)})</span>
                )}
              </span>
            </div>
          </div>
        </div>
      </Accordion>

      {/* ===== CARD 2: LEAD / CLIENT INFORMATION ===== */}
      <Accordion title="Lead / Client Information" icon={Users} defaultOpen>
        <div className="space-y-4">
          <FormField label="Lead / Client" required error={err('sourceLead')} hint="Type to search, or select an existing Lead or Client to auto-fill details below">
            <LeadClientCombobox
              value={form.sourceLead}
              onChange={(name) => setField('sourceLead', name)}
              onSelect={handleSourceSelect}
              onClear={handleSourceClear}
              prefillId={prefillClientId || prefillLeadId}
              prefillType={prefillClientId ? 'client' : prefillLeadId ? 'lead' : undefined}
            />
          </FormField>
          {onAddNewClient && (
            <button
              type="button"
              onClick={onAddNewClient}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0B4A3D] bg-[#0B4A3D]/5 hover:bg-[#0B4A3D]/10 border border-[#0B4A3D]/20 px-3 py-1.5 rounded-lg transition-colors cursor-pointer -mt-2"
            >
              <ExternalLink className="w-3 h-3" />
              + Add New Client
            </button>
          )}
          <div className={GRID}>
            <FormField label="Client Name" hint="Auto-filled from lead/client">
              <TextInput readOnly value={form.clientName} placeholder="Auto-filled from lead/client" />
            </FormField>
            <FormField label="Contact Person">
              <TypeOrSelect
                value={form.contactPerson}
                onChange={(v) => setField('contactPerson', v)}
                rememberKey="pr_contact_persons"
                placeholder="Contact person name"
              />
            </FormField>
            <FormField label="Phone" hint="Auto-filled">
              <TextInput readOnly value={form.phone} placeholder="Auto-filled" />
            </FormField>
            <FormField label="Email">
              {/* The ERP owns this value: browser autofill must not inject a saved
                  address into a brand-new CPR (the form is fully React-controlled). */}
              <TextInput type="email" autoComplete="off" name="cpr-email" value={form.email} onChange={(e) => setField('email', e.target.value)} placeholder="Email address" />
            </FormField>
            <FormField label="Company">
              <TypeOrSelect
                value={form.company}
                onChange={(v) => setField('company', v)}
                rememberKey="pr_companies"
                placeholder="Company name"
              />
            </FormField>
            <FormField label="GST">
              <TypeOrSelect
                value={form.gst}
                onChange={(v) => setField('gst', v)}
                rememberKey="pr_gst_numbers"
                placeholder="GST number"
              />
            </FormField>
            <FormField label="Project">
              <TypeOrSelect
                value={form.project}
                onChange={(v) => setField('project', v)}
                rememberKey="pr_projects"
                placeholder="Project name"
              />
            </FormField>
            <FormField label="Lead No" hint="Auto-filled">
              <TextInput readOnly value={form.leadNo} placeholder="Auto-filled" />
            </FormField>
            <FormField label="PAN">
              <TextInput autoComplete="off" name="cpr-pan" value={form.pan} onChange={(e) => setField('pan', e.target.value)} placeholder="PAN number" />
            </FormField>
            <FormField label="Preferred Vendor">
              <TextInput autoComplete="off" name="cpr-vendor" value={form.vendor} onChange={(e) => setField('vendor', e.target.value)} placeholder="Preferred vendor name" />
            </FormField>
          </div>
          <div className={GRID}>
            <FormField label="Billing Address">
              <TextArea rows={2} autoComplete="off" name="cpr-billing-address" value={form.billingAddress} onChange={(e) => setField('billingAddress', e.target.value)} placeholder="Billing address" />
            </FormField>
            <FormField label="Shipping Address">
              <TextArea rows={2} autoComplete="off" name="cpr-shipping-address" value={form.shippingAddress} onChange={(e) => setField('shippingAddress', e.target.value)} placeholder="Shipping address" />
            </FormField>
          </div>
        </div>
      </Accordion>

      {/* ===== CARD 3: ITEM DETAILS (always open, no toggle) ===== */}
      <div className="bg-surface border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="flex items-center gap-3 text-sm font-bold text-slate-900">
            <span className="p-2 rounded-lg bg-slate-100 text-slate-500 shrink-0">
              <Layers className="w-4 h-4" />
            </span>
            Item Details
          </h3>
        </div>
        <div>
          <CprItemGrid ref={gridRef} items={items} setItems={setItems} sourceForm={form} onColumnsChange={(cols) => setField('itemColumns', cols)} onEnsureSaved={onEnsureSaved} hideCostColumns={hideCostColumns} labelOverrides={itemLabelOverrides} />
        </div>
      </div>

      {/* ===== CARD 4: NOTES ===== */}
      <Accordion title="Notes" icon={StickyNote} defaultOpen>
        <div>
          <FormField label="Remarks" hint={`${form.remarks.length} chars`}>
            <TextArea
              rows={4}
              value={form.remarks}
              onChange={(e) => setField('remarks', e.target.value)}
              placeholder="Additional notes or remarks..."
              style={{ minHeight: '120px' }}
            />
          </FormField>
        </div>
      </Accordion>
    </div>
  );
}
