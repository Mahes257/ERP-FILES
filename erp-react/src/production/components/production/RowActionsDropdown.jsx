import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import './RowActionsDropdown.css';

/**
 * Three-dot (⋮) action menu for table rows.
 *
 * Uses a portal with fixed positioning so the menu is never clipped
 * by parent overflow containers. Position is calculated from the
 * trigger button's viewport coordinates and intelligently flips
 * upward / leftward when near screen edges.
 *
 * Props:
 *   actions: Array<{ label, onClick, icon?, danger?, disabled? }>
 */
export default function RowActionsDropdown({ actions = [] }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState({});

  const calculatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const btn = triggerRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const MENU_H = Math.min(actions.length * 36 + 16, 240);
    const MENU_W = 180;
    const GAP = 4;

    // Vertical: prefer below, flip above if not enough space
    let top;
    if (btn.bottom + GAP + MENU_H < vh) {
      top = btn.bottom + GAP;
    } else {
      top = btn.top - GAP - MENU_H;
    }
    // Clamp to viewport
    top = Math.max(4, Math.min(top, vh - MENU_H - 4));

    // Horizontal: prefer right-aligned, flip left if not enough space
    let left;
    if (btn.right - MENU_W >= 0) {
      left = btn.right - MENU_W;
    } else {
      left = btn.left;
    }
    // Clamp to viewport
    left = Math.max(4, Math.min(left, vw - MENU_W - 4));

    setMenuStyle({ position: 'fixed', top, left, minWidth: MENU_W });
  }, [actions.length]);

  // Open & calculate position
  const toggle = useCallback(() => {
    setOpen((v) => {
      const next = !v;
      if (next) {
        // Defer to next frame so trigger ref is measured after state update
        requestAnimationFrame(() => calculatePosition());
      }
      return next;
    });
  }, [calculatePosition]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (
        triggerRef.current && triggerRef.current.contains(e.target)
      ) return;
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Recalculate on scroll / resize while open
  useEffect(() => {
    if (!open) return;
    const recalc = () => calculatePosition();
    window.addEventListener('scroll', recalc, true);
    window.addEventListener('resize', recalc);
    return () => {
      window.removeEventListener('scroll', recalc, true);
      window.removeEventListener('resize', recalc);
    }
  }, [open, calculatePosition]);

  if (!actions.length) return null;

  return (
    <div className="rad-container">
      <button
        type="button"
        className="rad-trigger"
        ref={triggerRef}
        /* Rows in some Production tables (KPI drill-downs) navigate on click.
           Opening the ⋮ menu must not also open the row's detail page, which
           made every action in the menu unreachable. */
        onClick={(event) => {
          event.stopPropagation();
          toggle();
        }}
        aria-label="Row actions"
        title="Actions"
      >
        ⋮
      </button>

      {open && createPortal(
        <div className="rad-menu" ref={menuRef} style={menuStyle}>
          {actions.map((action, i) => (
            <button
              key={i}
              type="button"
              className={`rad-menu-item${action.danger ? ' rad-danger' : ''}`}
              disabled={action.disabled}
              /* The menu is portalled into <body>, but React still bubbles
                 its events through the component tree — so a clickable row
                 would navigate when a menu action is chosen. */
              onClick={(event) => {
                event.stopPropagation();
                setOpen(false);
                if (action.onClick) action.onClick(event);
              }}
            >
              {action.icon && <span className="rad-menu-icon">{action.icon}</span>}
              {action.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
