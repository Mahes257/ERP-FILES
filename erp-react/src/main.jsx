import { createRoot } from 'react-dom/client'
import './index.css'
// Purchase module enterprise design system (po-btn, po-badge, po-kpi, po-table, etc.)
import './styles/purchase-design-system.css'
// Purchase Requisition List enterprise design (pr-* classes, segmented-control, table, toolbar, KPI)
import './styles/cpr-list.css'
// ERP bulk-selection-toolbar.css port — pixel parity for the bulk action bar
import './bulk-selection-toolbar.css'
// CPR Technical Verification styles
import './styles/technical-verification.css'
// Sticky page header / top control section — global across every module
import './styles/sticky-page-header.css'
// Production module design system and styles
import './production/styles/theme.css'
import './production/styles/global.css'
import './production/styles/forms.css'
import './production/styles/table.css'
import './production/styles/production-design-system.css'
// Shared sticky data grid — ONE implementation of the fixed first column +
// fixed Actions column behaviour for every wide ERP list table (CRM, CPR,
// Sales, Marketing). Imported last so it wins specificity ties.
import './styles/sticky-data-grid.css'
// Sales module creation-page action button — the reference project's
// solid-green footer button (.erp-create-btn, styles/erp-creation-actions.css)
// applied through the .erp-create-scope container so only the Sales module
// Create/New forms are repainted. Imported last so it wins specificity ties.
import './styles/erp-create-scope.css'
// Detail/view page action bar — the reference project's detail-action button
// family (.erp-detail-action, styles/erp-detail-actions.css) applied through
// the .erp-detail-scope container so only the opted-in view pages are
// repainted (CRM Lead / Client / Follow-up, CPR Cost Workout detail). The
// scope class is what keeps this off every other module that renders the same
// class names. Imported last so it wins specificity ties.
import './styles/erp-detail-scope.css'
import App from './App.jsx'

// Restore theme before first paint to avoid a flash of the wrong theme.
try {
  if (localStorage.getItem('erp-theme') === 'dark') {
    document.documentElement.classList.add('dark')
  }
} catch {
  // storage unavailable - default to light theme
}

// NOTE: React <StrictMode> was intentionally removed. In development it
// double-invokes every effect on mount, firing every list/stats/counts/master
// API request TWICE per page visit — the largest source of duplicate requests
// and page buffering in dev. Re-enable it once the duplicate-traffic audit is
// complete if stricter dev checks are desired.
createRoot(document.getElementById('root')).render(<App />)
