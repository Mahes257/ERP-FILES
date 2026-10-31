/**
 * purchase/components/ActivityLogKpi.jsx
 * ------------------------------------------------------------------
 * THE single shared KPI summary for Activity Log pages — used by both
 * Purchase Requisition → Activity Log and Vendor Management → Activity
 * Log so the KPI section is rendered from the exact same component
 * (no per-page implementations).
 *
 * Every card is always derived from the audit `entries`:
 *
 *   · Total Events               — entries.length
 *   · <module-specific counts>   — entries whose toneOf(action) matches
 *   · Last Activity              — newest entry date, formatted without
 *                                  ever truncating the value:
 *                                    “Today 2:15 PM”
 *                                    “Yesterday”
 *                                    “04 Aug 2026 15:15”
 *
 * `cards` carries only the module-specific count definitions
 * ({ key, label, icon, color, bg, tone }); the tone is resolved with the
 * page's own actionTone() so the counts use the exact same action
 * classification as the table badges.
 *
 * A KPI with a zero value still renders its card with full geometry —
 * cards never collapse or resize (see .pral-page rules in
 * requisition-activity-polish.css).
 * ------------------------------------------------------------------
 */
import { useMemo } from 'react';
import { Activity, Clock3 } from 'lucide-react';
import PurchaseKpiCards from './PurchaseKpiCards';
import { formatActivityDate } from '../utils/helpers';

/** Normalise an action string the same way every page's actionTone does. */
const toTone = (toneOf, action) => (typeof toneOf === 'function' ? toneOf(String(action || '')) : 'other');

export default function ActivityLogKpi({ entries = [], loading = false, toneOf, cards = [] }) {
  const kpiCards = useMemo(() => {
    const countFor = (tone) => entries.filter((entry) => toTone(toneOf, entry.action) === tone).length;

    /* Newest entry — the “Last Activity” value (never truncated). */
    const last = entries.reduce((acc, entry) => {
      const t = new Date(entry.date || 0).getTime();
      const at = new Date(acc.date || 0).getTime();
      return t > at ? entry : acc;
    }, entries[0] || {});

    return [
      {
        key: 'totalEvents',
        label: 'Total Events',
        icon: Activity,
        color: '#0A4F44',
        bg: 'rgba(10,79,68,0.08)',
        value: String(entries.length)
      },
      ...cards.map((card) => ({
        ...card,
        value: String(countFor(card.tone))
      })),
      {
        key: 'lastActivity',
        label: 'Last Activity',
        icon: Clock3,
        color: '#7C3AED',
        bg: 'rgba(124,58,237,0.10)',
        value: last.date ? formatActivityDate(last.date) : '—'
      }
    ];
  }, [entries, toneOf, cards]);

  return <PurchaseKpiCards variant="cpr" cards={kpiCards} loading={loading} gridClass="" />;
}
