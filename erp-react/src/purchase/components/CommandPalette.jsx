/**
 * purchase/components/CommandPalette.jsx
 * ------------------------------------------------------------------
 * Global command search — Ctrl/Cmd+K palette.
 *
 * Powered by services/globalSearch.js: searches every Purchase
 * document type (PR, RFQ, Quotation, Vendor, PO, Packing, Shipment,
 * GRN, Inspection, Inventory, Invoice, Payment, Document) by number,
 * vendor, SKU, item, reference or invoice number. Every result opens
 * the REAL record and shows its related-document chain
 * (PR → RFQ → Quotation → PO → Packing → Shipment → GRN → Inspection
 * → Inventory → Invoice → Payment), each chip navigating to the real
 * record. No synthetic results — the store data is the only source.
 * ------------------------------------------------------------------
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText, Search, X, ArrowRight, Building2, Truck, Receipt,
  ClipboardList, PackageCheck, FolderOpen, Loader2, Command,
  Factory, Ship, ShieldCheck, Boxes, Wallet, History
} from 'lucide-react';
import { globalSearchService } from '../services/globalSearch';

const SEARCH_GROUPS = [
  { key: 'pr', label: 'Purchase Requisition', icon: ClipboardList, color: 'text-blue-600', bg: 'bg-blue-50' },
  { key: 'rfq', label: 'RFQ', icon: FileText, color: 'text-violet-600', bg: 'bg-violet-50' },
  { key: 'quotation', label: 'Quotation', icon: FileText, color: 'text-teal-600', bg: 'bg-teal-50' },
  { key: 'vendor', label: 'Vendor', icon: Building2, color: 'text-orange-600', bg: 'bg-orange-50' },
  { key: 'po', label: 'Purchase Order', icon: Truck, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  { key: 'packing', label: 'Packing', icon: Factory, color: 'text-slate-600', bg: 'bg-slate-100' },
  { key: 'shipment', label: 'Shipment', icon: Ship, color: 'text-cyan-600', bg: 'bg-cyan-50' },
  { key: 'grn', label: 'GRN', icon: PackageCheck, color: 'text-amber-600', bg: 'bg-amber-50' },
  { key: 'inspection', label: 'Inspection', icon: ShieldCheck, color: 'text-lime-600', bg: 'bg-lime-50' },
  { key: 'inventory', label: 'Inventory', icon: Boxes, color: 'text-indigo-600', bg: 'bg-indigo-50' },
  { key: 'invoice', label: 'Invoice', icon: Receipt, color: 'text-rose-600', bg: 'bg-rose-50' },
  { key: 'payment', label: 'Payment', icon: Wallet, color: 'text-fuchsia-600', bg: 'bg-fuchsia-50' },
  { key: 'document', label: 'Document', icon: FolderOpen, color: 'text-slate-600', bg: 'bg-slate-50' },
];

export default function CommandPalette({ open, onClose }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  /* ─── Focus input on open ─── */
  /* eslint-disable react-hooks/set-state-in-effect -- intentional: the
     palette resets its transient state each time it opens. */
  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /* ─── Search via the global search service ─── */
  const doSearch = useCallback(async (q) => {
    if (!q || q.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const data = await globalSearchService.searchAll(q, { limit: 6 });
      setResults(data);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  /* ─── Debounced search ─── */
  /* eslint-disable react-hooks/set-state-in-effect -- intentional: the
     palette clears stale results while a query is shorter than 2 chars. */
  useEffect(() => {
    if (!query || query.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => doSearch(query), 250);
    return () => clearTimeout(timer);
  }, [query, doSearch]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /* ─── Group results by type (canonical order) ─── */
  const grouped = useMemo(() => {
    const groups = {};
    SEARCH_GROUPS.forEach((g) => { groups[g.key] = []; });
    results.forEach((r) => {
      if (groups[r.type]) groups[r.type].push(r);
    });
    return Object.entries(groups).filter(([, items]) => items.length > 0);
  }, [results]);

  /* ─── Flat list for keyboard navigation ─── */
  const flatResults = useMemo(() => grouped.flatMap(([, items]) => items), [grouped]);

  /* ─── Navigate to a real record ─── */
  const handleSelect = useCallback((item) => {
    onClose();
    if (item.route) navigate(item.route);
  }, [navigate, onClose]);

  const handleChainClick = useCallback((e, route) => {
    e.stopPropagation();
    onClose();
    if (route) navigate(route);
  }, [navigate, onClose]);

  /* ─── Keyboard navigation ─── */
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      onClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flatResults.length - 1));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    }
    if (e.key === 'Enter' && flatResults[activeIndex]) {
      handleSelect(flatResults[activeIndex]);
    }
  }, [flatResults, activeIndex, handleSelect, onClose]);

  /* ─── Scroll active item into view ─── */
  useEffect(() => {
    if (!listRef.current) return;
    const activeEl = listRef.current.querySelector(`[data-cmd-index="${activeIndex}"]`);
    if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (!open) return null;

  let flatIdx = -1;

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh]" role="dialog" aria-modal="true" aria-label="Command search">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden" onKeyDown={handleKeyDown}>
        {/* Search input */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
          <Search className="w-5 h-5 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
            placeholder="Search any document number, vendor, SKU, item or reference..."
            className="flex-1 text-sm font-medium text-slate-800 bg-transparent outline-none placeholder:text-slate-400"
            aria-label="Search"
          />
          {loading && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
          <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 text-[10px] font-bold text-slate-400">
            ESC
          </kbd>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 cursor-pointer">
            <X size={16} className="text-slate-400" />
          </button>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[60vh] overflow-y-auto">
          {query && query.length >= 2 && !loading && results.length === 0 && (
            <div className="px-5 py-12 text-center">
              <Search className="w-8 h-8 mx-auto text-slate-200 mb-3" />
              <p className="text-sm font-semibold text-slate-500">No results for &ldquo;{query}&rdquo;</p>
              <p className="text-xs text-slate-400 mt-1">Try a document number, vendor, SKU or item name</p>
            </div>
          )}

          {!query && (
            <div className="px-5 py-12 text-center">
              <Command className="w-8 h-8 mx-auto text-slate-200 mb-3" />
              <p className="text-sm font-semibold text-slate-500">Type to search across all Purchase modules</p>
              <p className="text-xs text-slate-400 mt-1">Search a document number and see the full PR → RFQ → PO → GRN → Invoice chain</p>
            </div>
          )}

          {grouped.map(([groupKey, items]) => {
            const group = SEARCH_GROUPS.find((g) => g.key === groupKey);
            if (!group) return null;
            const Icon = group.icon;
            return (
              <div key={groupKey}>
                <div className="px-5 py-2 bg-slate-50/80 border-y border-slate-100">
                  <div className="flex items-center gap-2">
                    <Icon size={12} className={group.color} />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{group.label}</span>
                    <span className="text-[9px] font-bold text-slate-400 bg-slate-200 px-1.5 py-0.5 rounded-full">{items.length}</span>
                  </div>
                </div>
                {items.map((item) => {
                  flatIdx++;
                  const idx = flatIdx;
                  const isActive = idx === activeIndex;
                  const chain = item.chain || [];
                  return (
                    <button
                      key={`${item.type}-${item.id}`}
                      type="button"
                      data-cmd-index={idx}
                      onClick={() => handleSelect(item)}
                      onMouseEnter={() => setActiveIndex(idx)}
                      className={`w-full flex items-start gap-3 px-5 py-2.5 text-left transition-colors cursor-pointer ${
                        isActive ? 'bg-[#EDF7F4]' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${group.bg}`}>
                        <Icon size={14} className={group.color} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-800 truncate">{item.title}</span>
                          {item.status && (
                            <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full shrink-0">
                              {item.status}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate mt-0.5">
                          {[item.vendor, item.date && item.date.slice(0, 10)].filter(Boolean).join(' · ') || '\u00A0'}
                        </div>

                        {/* Related chain — every chip opens the real record */}
                        {chain.length > 0 && (
                          <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                            {chain.map((c, i) => (
                              <span key={`${c.type}-${c.number}-${i}`} className="flex items-center gap-1">
                                {i > 0 && <ArrowRight size={8} className="text-slate-300" />}
                                <button
                                  type="button"
                                  onClick={(e) => handleChainClick(e, c.route)}
                                  title={`${c.short} ${c.number}`}
                                  className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold transition-colors ${
                                    c.current
                                      ? 'bg-[#0B4A3D] text-white'
                                      : 'bg-slate-100 text-slate-500 hover:bg-[#0B4A3D] hover:text-white'
                                  }`}
                                >
                                  {c.short}
                                </button>
                              </span>
                            ))}
                            {item.route360 && (
                              <span className="flex items-center gap-1">
                                <ArrowRight size={8} className="text-slate-300" />
                                <button
                                  type="button"
                                  onClick={(e) => handleChainClick(e, item.route360)}
                                  title="Open audit history / 360 view"
                                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-500 hover:bg-[#0B4A3D] hover:text-white transition-colors"
                                >
                                  <History size={8} /> Audit
                                </button>
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <ArrowRight size={12} className={`shrink-0 mt-1 ${isActive ? 'text-[#0B4A3D]' : 'text-slate-300'}`} />
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-2 border-t border-slate-100 flex items-center gap-4 text-[10px] text-slate-400">
          <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 rounded border border-slate-200 bg-slate-50 font-bold">↑↓</kbd> navigate</span>
          <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 rounded border border-slate-200 bg-slate-50 font-bold">↵</kbd> select</span>
          <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 rounded border border-slate-200 bg-slate-50 font-bold">esc</kbd> close</span>
          <span className="ml-auto text-slate-300">Chain chips open the real record</span>
        </div>
      </div>
    </div>
  );
}