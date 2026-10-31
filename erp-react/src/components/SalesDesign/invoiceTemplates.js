// ============================================================================
// Invoice design system — 10 dedicated Invoice templates.
//
// These REPLACE the shared Sales-Document template set for the Invoice module.
// Each template is a genuinely different A4 composition (typography, header
// architecture, information arrangement, card/border system, item table,
// financial summary, signature and footer) — not a colour theme of one layout.
// The palette is part of each design, so no separate colour-theme selector is
// offered for the Invoice module.
//
// The renderer stays the same (ExportInvoiceDocument + invoice-templates.css)
// so Preview = Print = PDF by construction. Export and Domestic invoices share
// each design language; the CONTENT adapts inside the shared structure
// (exporter/buyer/consignee/LUT + IGST for exports, billing/shipping +
// CGST/SGST for domestic). Stored template keys are preserved: legacy records
// saved with an old shared template key are mapped to the closest new design
// via normalizeInvoiceTemplate, and the new key is written back on Save.
// ============================================================================

export const INVOICE_TEMPLATES = [
  {
    key: 'dynamic-grid',
    name: 'Dynamic Grid',
    desc: 'Modular data-driven composition with accent highlights and flexible grid zones.',
    layout: 'dynamic-grid',
    theme: 'navy'
  },
  {
    key: 'fluid-wave',
    name: 'Fluid Wave',
    desc: 'Flowing organic dividers, soft accents and a large elegant title.',
    layout: 'fluid-wave',
    theme: 'teal'
  },
  {
    key: 'bold-contrast',
    name: 'Bold Contrast',
    desc: 'Full-width dark masthead, strong typography and a high-contrast total block.',
    layout: 'bold-contrast',
    theme: 'charcoal'
  },
  {
    key: 'timeline-flow',
    name: 'Timeline Flow',
    desc: 'Visual document progression with technical markers and connecting rules.',
    layout: 'timeline-flow',
    theme: 'slate'
  },
  {
    key: 'magazine-style',
    name: 'Magazine Style',
    desc: 'Editorial serif composition with asymmetric placement and thin rules.',
    layout: 'magazine-style',
    theme: 'vishak'
  },
  {
    key: 'infographic-fusion',
    name: 'Infographic Fusion',
    desc: 'KPI-style financial blocks, data chips and a dominant Grand Total.',
    layout: 'infographic-fusion',
    theme: 'royal'
  },
  {
    key: 'elegant-minimal',
    name: 'Elegant Minimal',
    desc: 'Ultra-clean cream document with serif headings and muted gold accents.',
    layout: 'elegant-minimal',
    theme: 'burgundy'
  },
  {
    key: 'photo-centric',
    name: 'Photo-Centric (Typography)',
    desc: 'Large visual header area with bold typographic blocks and generous whitespace.',
    layout: 'photo-centric',
    theme: 'charcoal'
  },
  {
    key: 'geometric-layers',
    name: 'Geometric Layers',
    desc: 'Angular layered blocks and geometric separators in navy, amber and steel.',
    layout: 'geometric-layers',
    theme: 'navy'
  },
  {
    key: 'classic-formal',
    name: 'Classic Formal',
    desc: 'Traditional navy / cream commercial invoice with formal borders and serif hierarchy.',
    layout: 'classic-formal',
    theme: 'navy'
  }
];

export function invoiceTemplateFor(key) {
  return INVOICE_TEMPLATES.find((t) => t.key === key) || null;
}

// Legacy shared template keys (the old 10-template Sales Document system) map
// to the closest new Invoice design so saved documents never break.
const LEGACY_TO_INVOICE = {
  'modern-clean': 'classic-formal', // Classic Corporate → formal traditional
  'corporate-grid': 'elegant-minimal', // Editorial Minimal → minimal
  'elegant-framed': 'geometric-layers', // Engineering Technical → layered geometry
  'split-header': 'dynamic-grid', // Modern Modular → modular grid
  'vertical-sidebar': 'magazine-style', // Luxury Fine-line → editorial
  'curved-accent': 'bold-contrast', // Dark Executive → high contrast
  'premium-executive': 'fluid-wave', // Blueprint Industrial → flowing sections
  'minimal-editorial': 'infographic-fusion', // Financial Report → data-driven
  'professional-corporate': 'bold-contrast', // Modern Technology → bold masthead
  'global-engineering': 'timeline-flow' // Architectural Grid → structured flow
};

/**
 * Normalize any stored template key to a valid Invoice template key.
 * New keys pass through untouched; legacy shared keys are mapped; anything
 * unknown falls back to the first (Dynamic Grid) design.
 */
export function normalizeInvoiceTemplate(key) {
  if (!key) return INVOICE_TEMPLATES[0].key;
  if (invoiceTemplateFor(key)) return key;
  return LEGACY_TO_INVOICE[key] || INVOICE_TEMPLATES[0].key;
}

// Auto Generate — deterministic per document (mirrors the shared helper but
// picks from the Invoice set). Same document always lands on the same design.
function hashString(value) {
  let hash = 0;
  const str = String(value ?? '');
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function autoGenerateInvoiceDesign(seed) {
  const hash = hashString(seed);
  return INVOICE_TEMPLATES[hash % INVOICE_TEMPLATES.length] || INVOICE_TEMPLATES[0];
}