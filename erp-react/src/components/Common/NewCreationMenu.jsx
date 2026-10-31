import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Plus, Upload } from 'lucide-react';
import BulkUploadModal from './BulkUploadModal';
import { clearBulkQueue } from '../../utils/bulkUpload';

const DEFAULT_TRIGGER =
  'flex items-center gap-2 bg-[#0B4A3D] hover:bg-[#083D34] text-white text-[12.5px] font-bold px-4 h-[38px] rounded-[9px] transition-colors shadow-sm cursor-pointer select-none w-fit';

const ITEM_CLS =
  'w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-xs font-semibold text-slate-700 hover:bg-[#0B4A3D]/5 hover:text-[#0B4A3D] transition-colors cursor-pointer';

/**
 * NewCreationMenu — the "New â–¼" dropdown shared by every module with a
 * creation flow.
 *
 *   New â–¼
 *   â”œâ”€ Create New   → navigates to the module's existing creation route
 *   â””â”€ Bulk Upload  → when `bulkTo` is provided, navigates to the module's
 *                     DEDICATED bulk-upload page; otherwise opens the shared
 *                     BulkUploadModal (extract → pre-fill → review → Save).
 *
 * The trigger keeps the module's existing primary-button styling/position
 * (via buttonClassName) and the dropdown renders through a portal so it is
 * never clipped by the page header.
 */
export default function NewCreationMenu({
  moduleKey,
  createTo,
  bulkTo,
  buttonLabel = 'New',
  buttonClassName = DEFAULT_TRIGGER,
  menuClassName = '',
  dedupeService,
  openInNewTab = false
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  const MARGIN = 8;
  const GAP = 6;

  const positionMenu = useCallback(() => {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const menuWidth = Math.min(menu?.offsetWidth || 220, vw - 2 * MARGIN);
    const menuHeight = menu?.offsetHeight || 200;

    const spaceBelow = vh - rect.bottom - GAP;
    let top = rect.bottom + GAP;
    if (spaceBelow < menuHeight && rect.top - GAP > spaceBelow) {
      top = Math.max(MARGIN, rect.top - menuHeight - GAP);
    }
    top = Math.max(MARGIN, Math.min(top, vh - MARGIN - menuHeight));

    let left = rect.right - menuWidth;
    if (left < MARGIN) {
      left = rect.left;
      if (left + menuWidth > vw - MARGIN) left = vw - MARGIN - menuWidth;
    }
    left = Math.max(MARGIN, Math.min(left, vw - menuWidth - MARGIN));
    setPos({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (!open) return undefined;
    positionMenu();
    const onResize = () => positionMenu();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open, positionMenu]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onDown = (e) => {
      if (triggerRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open]);

  return (
    <>
      <div ref={triggerRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-haspopup="menu"
          aria-expanded={open}
          className={buttonClassName}
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>{buttonLabel}</span>
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>
      </div>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            className={`bg-surface border border-slate-200 rounded-xl shadow-xl py-1.5 min-w-[210px] ${menuClassName}`}
            style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 2147483000 }}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                // An explicit "Create New" always starts a fresh form — any
                // pending bulk-upload queue is discarded.
                if (moduleKey) clearBulkQueue(moduleKey);
                if (openInNewTab) {
                  window.open(createTo, '_blank', 'noopener,noreferrer');
                } else {
                  navigate(createTo);
                }
              }}
              className={ITEM_CLS}
            >
              <Plus className="w-4 h-4 text-[#0B4A3D]" />
              <span>Create New</span>
            </button>
            <div className="mx-3 my-1 h-px bg-slate-100" role="separator" />
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                if (bulkTo) {
                  if (moduleKey) clearBulkQueue(moduleKey);
                  if (openInNewTab) {
                    window.open(bulkTo, '_blank', 'noopener,noreferrer');
                  } else {
                    navigate(bulkTo);
                  }
                  return;
                }
                setBulkOpen(true);
              }}
              className={ITEM_CLS}
            >
              <Upload className="w-4 h-4 text-emerald-600" />
              <span>Bulk Upload</span>
            </button>
          </div>,
          document.body
        )}

      <BulkUploadModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        moduleKey={moduleKey}
        createRoute={createTo}
        dedupeService={dedupeService}
      />
    </>
  );
}
