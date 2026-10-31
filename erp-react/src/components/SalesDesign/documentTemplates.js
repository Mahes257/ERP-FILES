// ============================================================================
// Shared Sales Document design system — 10 genuinely different templates.
//
// ONE reusable configuration consumed by every document preview workspace:
//   • Quotation        → pages/sales/QuotationDesign.jsx   (#quotation-sheet)
//   • Packing List     → SalesDocumentDesign + packing list canvas
//   • Invoice          → SalesDocumentDesign + ExportInvoiceDocument
//   • Proforma Invoice → SalesDocumentDesign + ProformaInvoiceDocument
//   • Delivery Challan → SalesDocumentDesign
//   • Credit Note      → SalesDocumentDesign
//   • Payment Receipt  → SalesDocumentDesign
//   • Sales Contract   → SalesDocumentDesign
//   • Sales Order      → SalesDocumentDesign
//
// PURE CONFIGURATION. No business data, no calculations: it only describes
// the visual design system for non-quotation sales documents. Quotations use
// their dedicated renderer and template registry in pages/sales/QuotationSheet.
//
// Each of the 10 templates has a DIFFERENT layout key (its own `data-template`
// value). Layouts are NOT aliased — every template owns its own CSS block in
// document-templates.css. The `theme` field is the recommended signature colour
// pairing (used by the template picker and Auto Generate); the colour theme
// stays independently selectable in the Theme tab.
// ============================================================================

export const DOCUMENT_TEMPLATES = [
  {
    key: 'modern-clean',
    name: 'Classic Corporate',
    desc: 'Formal serif-led corporate document with traditional rules and statement-style tables.',
    layout: 'teal-sidebar',
    theme: 'vishak',
    renderer: 'shared-sales',
    supportedDocumentTypes: ['quotation', 'sales-contract', 'sales-order', 'delivery-challan', 'invoice', 'proforma-invoice', 'packing-list', 'credit-note', 'payment-receipt']
  },
  {
    key: 'corporate-grid',
    name: 'Editorial Minimal',
    desc: 'Open editorial composition with generous whitespace and hairline dividers.',
    layout: 'classic-minimal',
    theme: 'navy',
    renderer: 'shared-sales',
    supportedDocumentTypes: ['quotation', 'sales-contract', 'sales-order', 'delivery-challan', 'invoice', 'proforma-invoice', 'packing-list', 'credit-note', 'payment-receipt']
  },
  {
    key: 'elegant-framed',
    name: 'Engineering Technical',
    desc: 'Dense technical grid with monospace metadata and title-block geometry.',
    layout: 'technical-blueprint',
    theme: 'royal',
    renderer: 'shared-sales',
    supportedDocumentTypes: ['quotation', 'sales-contract', 'sales-order', 'delivery-challan', 'invoice', 'proforma-invoice', 'packing-list', 'credit-note', 'payment-receipt']
  },
  {
    key: 'split-header',
    name: 'Modern Modular',
    desc: 'Soft modular cards with floating information groups and a dedicated finance module.',
    layout: 'modular-cards',
    theme: 'charcoal',
    renderer: 'shared-sales',
    supportedDocumentTypes: ['quotation', 'sales-contract', 'sales-order', 'delivery-challan', 'invoice', 'proforma-invoice', 'packing-list', 'credit-note', 'payment-receipt']
  },
  {
    key: 'vertical-sidebar',
    name: 'Luxury Fine-line',
    desc: 'Refined serif typography, wide margins and restrained fine-line hierarchy.',
    layout: 'premium-editorial',
    theme: 'teal',
    renderer: 'shared-sales',
    supportedDocumentTypes: ['quotation', 'sales-contract', 'sales-order', 'delivery-challan', 'invoice', 'proforma-invoice', 'packing-list', 'credit-note', 'payment-receipt']
  },
  {
    key: 'curved-accent',
    name: 'Dark Executive',
    desc: 'Charcoal executive composition with high-contrast tables and financial panels.',
    layout: 'structured-blue-grey',
    theme: 'navy',
    renderer: 'shared-sales',
    supportedDocumentTypes: ['quotation', 'sales-contract', 'sales-order', 'delivery-challan', 'invoice', 'proforma-invoice', 'packing-list', 'credit-note', 'payment-receipt']
  },
  {
    key: 'premium-executive',
    name: 'Blueprint Industrial',
    desc: 'Industrial green technology layout with offset geometry and compact technical content.',
    layout: 'fresh-tech-green',
    theme: 'royal',
    renderer: 'shared-sales',
    supportedDocumentTypes: ['quotation', 'sales-contract', 'sales-order', 'delivery-challan', 'invoice', 'proforma-invoice', 'packing-list', 'credit-note', 'payment-receipt']
  },
  {
    key: 'minimal-editorial',
    name: 'Financial Report',
    desc: 'Report-style hierarchy emphasizing statements, totals and numeric readability.',
    layout: 'dark-corporate',
    theme: 'charcoal',
    renderer: 'shared-sales',
    supportedDocumentTypes: ['quotation', 'sales-contract', 'sales-order', 'delivery-challan', 'invoice', 'proforma-invoice', 'packing-list', 'credit-note', 'payment-receipt']
  },
  {
    key: 'professional-corporate',
    name: 'Modern Technology',
    desc: 'Contemporary technology layout with bold split masthead and data-oriented modules.',
    layout: 'high-data-dashboard',
    theme: 'vishak',
    renderer: 'shared-sales',
    supportedDocumentTypes: ['quotation', 'sales-contract', 'sales-order', 'delivery-challan', 'invoice', 'proforma-invoice', 'packing-list', 'credit-note', 'payment-receipt']
  },
  {
    key: 'global-engineering',
    name: 'Architectural Grid',
    desc: 'Fine-line architectural composition with offset title block and precise alignment.',
    layout: 'architectural-grid',
    theme: 'slate',
    renderer: 'shared-sales',
    supportedDocumentTypes: ['quotation', 'sales-contract', 'sales-order', 'delivery-challan', 'invoice', 'proforma-invoice', 'packing-list', 'credit-note', 'payment-receipt']
  }
];

export function templateFor(key) {
  return DOCUMENT_TEMPLATES.find((t) => t.key === key) || null;
}

// The DOM keeps the persisted template key so the selector, preview, print and
// PDF paths all agree on the same design. Kept as a helper so older callers
// can safely normalize missing/legacy values without changing document data.
export function templateLayoutKey(key) {
  return templateFor(key)?.key || DOCUMENT_TEMPLATES[0].key;
}

export const DOCUMENT_THEMES = [
  {
    key: 'vishak',
    name: 'Vishak Green',
    swatch: '#0B4A3D',
    vars: {
      '--document-primary': '#0B4A3D',
      '--document-primary-dark': '#083D34',
      '--document-secondary': '#1E6B57',
      '--document-soft': '#E8F0EE',
      '--document-border': '#CBDCD6',
      '--document-muted': '#5C6B66',
      '--document-heading': '#10211C',
      '--document-tint': 'rgba(11, 74, 61, 0.04)'
    }
  },
  {
    key: 'navy',
    name: 'Navy Blue',
    swatch: '#1E3A8A',
    vars: {
      '--document-primary': '#1E3A8A',
      '--document-primary-dark': '#172554',
      '--document-secondary': '#3B5BDB',
      '--document-soft': '#E0E7FF',
      '--document-border': '#C7D2FE',
      '--document-muted': '#5A6478',
      '--document-heading': '#0F172A',
      '--document-tint': 'rgba(30, 58, 138, 0.04)'
    }
  },
  {
    key: 'royal',
    name: 'Royal Blue',
    swatch: '#1D4ED8',
    vars: {
      '--document-primary': '#1D4ED8',
      '--document-primary-dark': '#1E40AF',
      '--document-secondary': '#3B82F6',
      '--document-soft': '#DBEAFE',
      '--document-border': '#BFDBFE',
      '--document-muted': '#5B6B84',
      '--document-heading': '#0B1530',
      '--document-tint': 'rgba(29, 78, 216, 0.04)'
    }
  },
  {
    key: 'charcoal',
    name: 'Charcoal',
    swatch: '#334155',
    vars: {
      '--document-primary': '#334155',
      '--document-primary-dark': '#1E293B',
      '--document-secondary': '#475569',
      '--document-soft': '#E2E8F0',
      '--document-border': '#CBD5E1',
      '--document-muted': '#64748B',
      '--document-heading': '#0F172A',
      '--document-tint': 'rgba(51, 65, 85, 0.04)'
    }
  },
  {
    key: 'burgundy',
    name: 'Burgundy',
    swatch: '#7F1D1D',
    vars: {
      '--document-primary': '#7F1D1D',
      '--document-primary-dark': '#4C0519',
      '--document-secondary': '#991B1B',
      '--document-soft': '#F9E7E7',
      '--document-border': '#E8C9C9',
      '--document-muted': '#7A5C5C',
      '--document-heading': '#2B0A0A',
      '--document-tint': 'rgba(127, 29, 29, 0.04)'
    }
  },
  {
    key: 'teal',
    name: 'Teal',
    swatch: '#0F766E',
    vars: {
      '--document-primary': '#0F766E',
      '--document-primary-dark': '#115E59',
      '--document-secondary': '#14B8A6',
      '--document-soft': '#CCFBF1',
      '--document-border': '#99F6E4',
      '--document-muted': '#55706C',
      '--document-heading': '#0B2E2A',
      '--document-tint': 'rgba(15, 118, 110, 0.04)'
    }
  },
  {
    key: 'slate',
    name: 'Slate',
    swatch: '#475569',
    vars: {
      '--document-primary': '#475569',
      '--document-primary-dark': '#334155',
      '--document-secondary': '#64748B',
      '--document-soft': '#E2E8F0',
      '--document-border': '#CBD5E1',
      '--document-muted': '#64748B',
      '--document-heading': '#0F172A',
      '--document-tint': 'rgba(71, 85, 105, 0.04)'
    }
  }
];

export function themeFor(key) {
  return DOCUMENT_THEMES.find((t) => t.key === key) || null;
}

/**
 * CSS custom-property map for a theme key (empty map when unknown).
 * Publishes the canonical --document-* variables plus the --quotation-* and
 * --acc* aliases so every sheet (quotation and salesdoc alike) and the shared
 * Export / Proforma document components recolor from one theme definition.
 */
export function themeVarsFor(key) {
  const theme = themeFor(key);
  if (!theme) return {};
  const vars = { ...theme.vars };
  Object.keys(vars).forEach((name) => {
    if (name.startsWith('--document-')) {
      vars[name.replace('--document-', '--quotation-')] = vars[name];
    }
  });
  vars['--acc'] = vars['--document-primary'];
  vars['--acc-dark'] = vars['--document-primary-dark'];
  vars['--acc-soft'] = vars['--document-soft'];
  return vars;
}

// ---------------------------------------------------------------------------
// Auto Generate — deterministic, never random business content.
// Picks a suitable template + its signature colour theme from a stable hash
// of the document's own id, so the same document always lands on the same
// professional combination. Only the visual design changes; the document
// data is never touched.
// ---------------------------------------------------------------------------
function hashString(value) {
  let hash = 0;
  const str = String(value ?? '');
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function autoGenerateDesign(seed) {
  const hash = hashString(seed);
  const template = DOCUMENT_TEMPLATES[hash % DOCUMENT_TEMPLATES.length] || DOCUMENT_TEMPLATES[0];
  const theme = themeFor(template.theme) || DOCUMENT_THEMES[0];
  return { template: template.key, theme: theme.key };
}
