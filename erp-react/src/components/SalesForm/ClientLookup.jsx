import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search } from 'lucide-react';
import useClickOutside from '../../hooks/useClickOutside';
import customerService from '../../services/customerService';

const INPUT_CLS =
  'w-full bg-slate-50 border border-slate-200/80 rounded-lg px-3 py-2 text-xs text-slate-700 placeholder-slate-400 outline-none focus:border-emerald-600/50 focus:bg-surface transition-all shadow-inner';

/**
 * Type-or-select Client combobox matching the original ERP's CustomerLookup:
 * selecting a customer auto-fills contact person, phone, email, GST, PAN,
 * billing + shipping addresses, payment terms and credit info.
 *
 * `portal` renders the suggestion list in a fixed overlay positioned at the
 * input, so it can never be clipped by overflow-hidden parents (e.g. the
 * Accordion sections used by the Sales Execution forms).
 */
export default function ClientLookup({ value, onChange, onAutoFill, label = 'Client', placeholder, portal = false, refreshKey = 0 }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const [pos, setPos] = useState(null);
  useClickOutside(wrapRef, () => setOpen(false), open);

  // Portal positioning (used inside scroll/overflow containers).
  const positionDd = () => {
    const input = inputRef.current;
    if (!input) return;
    const rect = input.getBoundingClientRect();
    let left = Math.max(8, rect.left);
    const width = Math.max(rect.width, 280);
    if (left + width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - width - 8);
    }
    const spaceBelow = window.innerHeight - rect.bottom;
    const ddHeight = 256;
    const top = spaceBelow < ddHeight && rect.top > ddHeight ? rect.top - ddHeight : rect.bottom;
    const maxHeight = spaceBelow < ddHeight && rect.top > ddHeight ? Math.min(ddHeight, rect.top - 16) : Math.min(ddHeight, spaceBelow - 16);
    setPos({ left, width, top, maxHeight });
  };

  useEffect(() => {
    if (!open || !portal) return undefined;
    positionDd();
    const onScroll = () => positionDd();
    const onResize = () => positionDd();
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, portal, value]);

  useEffect(() => {
    let cancelled = false;
    customerService
      .list()
      .then((res) => {
        if (cancelled) return;
        setOptions(res?.data ?? res ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (c) =>
        String(c.businessName || '').toLowerCase().includes(q) ||
        String(c.clientCode || '').toLowerCase().includes(q) ||
        String(c.contactPerson || '').toLowerCase().includes(q) ||
        String(c.gstin || '').toLowerCase().includes(q) ||
        String(c.phone || '').toLowerCase().includes(q)
    );
  }, [options, query]);

  const select = (customer) => {
    setQuery('');
    setOpen(false);
    onChange(customer.businessName || customer.clientCode || '');
    onAutoFill?.(customer);
  };

  const list = (
    <>
      {!loaded && <div className="px-3 py-2.5 text-xs text-slate-400">Loading clients...</div>}
      {loaded && filtered.length === 0 && <div className="px-3 py-2.5 text-xs text-slate-400">No matches found</div>}
      {filtered.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => select(c)}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onTouchStart={(e) => e.stopPropagation()}
          className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-b-0 transition-colors cursor-pointer"
        >
          <span className="block text-xs font-semibold text-slate-700">
            {c.businessName || '(No Name)'}
          </span>
          <span className="block text-[10px] text-slate-400">
            {c.clientCode ? `${c.clientCode} · ` : ''}
            {c.contactPerson || ''} {c.city ? `· ${c.city}` : ''}
          </span>
        </button>
      ))}
    </>
  );

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={open ? query : value || ''}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder || `Type to search or select a ${label}`}
          aria-label={label}
          autoComplete="off"
          className={INPUT_CLS}
        />
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
      </div>
      {open &&
        (portal
          ? createPortal(
              <div
                className="fixed z-[9999] bg-surface border border-slate-200 rounded-lg shadow-xl overflow-y-auto"
                style={{
                  left: pos?.left,
                  width: pos?.width,
                  top: pos?.top,
                  maxHeight: pos?.maxHeight,
                  display: pos ? 'block' : 'none'
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onTouchStart={(e) => e.stopPropagation()}
              >
                {list}
              </div>,
              document.body
            )
          : (
            <div className="absolute left-0 right-0 top-full mt-1 z-40 max-h-64 overflow-y-auto bg-surface border border-slate-200 rounded-lg shadow-lg">
              {list}
            </div>
          ))}
    </div>
  );
}
