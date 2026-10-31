import { createContext, useContext } from 'react';
import { ChevronDown } from 'lucide-react';
import ActionMenu from './ActionMenu';
import { formatDate } from '../../utils/leadHelpers';

/**
 * Carries this cell's trigger markup into {@link TriggerSlot}.
 *
 * ActionMenu renders its `icon` prop as a COMPONENT TYPE, so React reconciles
 * the trigger by component identity. Passing a fresh inline arrow (as this file
 * used to) meant the identity changed on every render, and React resolves a
 * changed type by UNMOUNTING and REMOUNTING the trigger's DOM instead of
 * updating it. Rows re-render while a press is in flight (row-selection state,
 * list refreshes), so the node the user pressed was destroyed between mousedown
 * and mouseup — the browser then dispatched no `click` at all (the pressed node
 * was detached) and the popover silently never opened, even though the count
 * rendered fine. A module-level component has a permanently stable identity, so
 * React updates the existing DOM node in place and the press lands on one
 * unchanged node.
 */
const TriggerNodeContext = createContext(null);

function TriggerSlot() {
  return useContext(TriggerNodeContext);
}

/**
 * "Last Follow-up" cell with follow-up date history.
 *
 * The main value stays the LATEST follow-up date (existing cell styling).
 * Clicking the cell opens a portal-based dropdown listing every follow-up date,
 * newest first, with minimal supporting info (mode · status).
 * Uses the shared ActionMenu (portal + viewport-aware positioning) so the
 * dropdown is never clipped by the scrolling table. No follow-ups → a
 * "No follow-up history" empty state.
 *
 * Extracted verbatim from the CRM Leads list's Last Follow-up column (the
 * established "FOLLOW-UP HISTORY" pattern) so the exact same UI can be reused
 * by other lists (Sales → Quotations) without a second implementation. Leads
 * passes only `history`, which renders the original trigger unchanged.
 *
 * @param history       Real follow-up rows for the row: { id, followupDate,
 *                      mode, currentStatus, status }. Sorted newest first here.
 * @param renderTrigger Optional. `({ latest, records }) => node` replaces the
 *                      default date trigger, so a caller can keep its own cell
 *                      content (e.g. a status badge + count) while the dropdown
 *                      stays byte-for-byte this component's.
 */
export default function LastFollowupHistory({ history, renderTrigger }) {
  const sorted = (history || [])
    .filter((fu) => String(fu.status || '').toLowerCase() !== 'deleted')
    .sort((a, b) => String(b.followupDate || '').localeCompare(String(a.followupDate || '')));
  const latest = sorted[0];
  // Dropdown lists every follow-up for THIS row, newest first. The newest
  // entry is the current follow-up (shown directly in the cell); every entry
  // keeps its existing status and mode — no new statuses are invented.
  const items = [];
  if (sorted.length > 0) items.push({ heading: true, label: 'Follow-up History' });
  sorted.forEach((fu, index) => {
    const isCurrent = index === 0;
    const meta = [fu.mode, fu.currentStatus || fu.status].filter(Boolean).join(' · ');
    items.push({
      key: `fu-${fu.id}`,
      label: (
        <span className="inline-flex items-center gap-2 min-w-0">
          <span className="qpo-rev-item-no font-medium text-slate-700">{formatDate(fu.followupDate)}</span>
          {isCurrent ? (
            <span className="qpo-rev-badge qpo-rev-badge-current">Current</span>
          ) : (
            <span className="qpo-rev-badge">{fu.status || '—'}</span>
          )}
          {meta && <span className="crm-erp-cell-muted text-[10px]">{meta}</span>}
        </span>
      )
    });
  });
  const menuItems = items.length > 0 ? items : [{ key: 'empty', label: 'No follow-up history' }];
  // The trigger's markup is rebuilt every render; it travels to ActionMenu
  // through the module-level TriggerSlot so the component identity (and so the
  // trigger's DOM node) survives re-renders — see TriggerNodeContext.
  const trigger = renderTrigger
    ? renderTrigger({ latest, records: sorted })
    : (
        <span className="inline-flex items-center gap-1 crm-erp-cell-muted hover:text-[#0B4A3D] hover:font-semibold transition-colors">
          {latest ? formatDate(latest.followupDate) : '—'}
          <ChevronDown className="w-3 h-3 opacity-60" />
        </span>
      );

  return (
    <TriggerNodeContext.Provider value={trigger}>
      <ActionMenu
        items={menuItems}
        onAction={() => {}}
        buttonLabel="Follow-up history"
        icon={TriggerSlot}
        triggerClassName="bg-transparent border-0 p-0 cursor-pointer font-inherit"
        menuClassName="crm-erp-row-actions-menu"
      />
    </TriggerNodeContext.Provider>
  );
}
