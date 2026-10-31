/**
 * SettingsPageHeader
 * ------------------------------------------------------------------
 * Shared top chrome for the Advanced Settings screens so they read as the
 * SAME product as the `/settings` landing page:
 *
 *   • subtle but polished Back affordance (ghost action)
 *   • strong, tight page title
 *   • quiet one-line subtitle
 *   • an `actions` slot for the page's secondary + primary buttons
 *
 * The wrapper carries `data-erp-sticky-header`, which this app's globally
 * mounted useStickyPageHeader (AppLayout) picks up automatically, so the block
 * pins under the topbar exactly like every other page header. No
 * routing/permission logic lives here — pages pass their own handlers.
 *
 * The `.erp-btn` / `.erp-btn-ghost` classes this uses are defined by the
 * Settings-owned stylesheet `src/styles/settings-ui.css`, which the Settings
 * pages import (see `pages/AdvancedSettings.jsx`). A destination screen that
 * reuses this header must import that stylesheet too.
 */

import { ArrowLeft } from 'lucide-react';

export default function SettingsPageHeader({ title, subtitle, onBack, actions }) {
  return (
    <header data-erp-sticky-header className="mb-5">
      <button
        type="button"
        onClick={onBack}
        className="erp-btn erp-btn-ghost -ml-3.5 mb-4"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Back
      </button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[28px] font-bold tracking-tight text-ink">
            {title}
          </h1>
          <p className="mt-1.5 text-sm text-ink-2">{subtitle}</p>
        </div>

        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2.5">
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}
