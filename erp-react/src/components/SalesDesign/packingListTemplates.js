// ============================================================================
// Packing List design system — 15 dedicated Packing List templates.
//
// These REPLACE the shared Sales-Document template set for the Packing List
// module. Each template is a genuinely different A4 composition (typography,
// header architecture, information arrangement, card/border system, package +
// item tables, logistics summary, declaration, signature and footer) — not a
// colour theme of one layout. The palette is part of each design, so no
// separate colour-theme selector is offered for the Packing List module.
//
// The renderer stays the same (PackingListDocument + packing-list-templates.css)
// so Preview = Print = PDF by construction. Stored template keys are preserved:
// legacy records saved with an old shared template key are mapped to the
// closest new design via normalizePackingListTemplate, and the new key is
// written back when the document is saved again.
// ============================================================================

export const PACKING_LIST_TEMPLATES = [
  {
    key: 'global-trade-classic',
    name: 'Global Trade Classic',
    desc: 'Traditional international-trade letterhead with formal bordered sections and serif headings.',
    layout: 'global-trade-classic',
    theme: 'navy'
  },
  {
    key: 'modern-logistics',
    name: 'Modern Logistics',
    desc: 'Compact modular logistics document with blue-grey palette and clean sans-serif hierarchy.',
    layout: 'modern-logistics',
    theme: 'slate'
  },
  {
    key: 'elegant-export',
    name: 'Elegant Export',
    desc: 'Premium navy / silver export document with geometric dividers and a fine-line table.',
    layout: 'elegant-export',
    theme: 'navy'
  },
  {
    key: 'infographic-style',
    name: 'Infographic Style',
    desc: 'Data-focused logistics document with bold KPI-style totals and modular data zones.',
    layout: 'infographic-style',
    theme: 'royal'
  },
  {
    key: 'minimalist-erp',
    name: 'Minimalist ERP',
    desc: 'Ultra-clean ERP document with open sections, thin rules and generous whitespace.',
    layout: 'minimalist-erp',
    theme: 'vishak'
  },
  {
    key: 'corporate-blue',
    name: 'Corporate Blue',
    desc: 'Strong corporate ERP document with blue-grey masthead and structured section headers.',
    layout: 'corporate-blue',
    theme: 'navy'
  },
  {
    key: 'dynamic-grid',
    name: 'Dynamic Grid',
    desc: 'Flexible CSS Grid composition whose content zones resize with the actual data.',
    layout: 'dynamic-grid',
    theme: 'slate'
  },
  {
    key: 'elegant-borderless',
    name: 'Elegant Borderless',
    desc: 'Teal / grey open composition separated by spacing, typography and subtle tonal rules.',
    layout: 'elegant-borderless',
    theme: 'teal'
  },
  {
    key: 'photo-header',
    name: 'Photo Header (Typography)',
    desc: 'Large typographic header area with accent geometry — no photographs.',
    layout: 'photo-header',
    theme: 'charcoal'
  },
  {
    key: 'geometric-layers',
    name: 'Geometric Layers',
    desc: 'Angular layered blocks and diagonal gradient separators in navy, amber and steel.',
    layout: 'geometric-layers',
    theme: 'navy'
  },
  {
    key: 'timeline-shipment',
    name: 'Timeline Shipment',
    desc: 'Shipment progression strip (origin → port → vessel → destination) with technical markers.',
    layout: 'timeline-shipment',
    theme: 'slate'
  },
  {
    key: 'elegant-monochrome',
    name: 'Elegant Monochrome',
    desc: 'Premium black & white document with one restrained accent and sharp fine-line tables.',
    layout: 'elegant-monochrome',
    theme: 'charcoal'
  },
  {
    key: 'dashboard-style',
    name: 'Dashboard Style',
    desc: 'Data-rich logistics report with KPI-style package/weight panels and a heavy item table.',
    layout: 'dashboard-style',
    theme: 'royal'
  },
  {
    key: 'global-minimal',
    name: 'Global Minimal',
    desc: 'Neutral international minimalist document with a subtle CSS world-trade accent.',
    layout: 'global-minimal',
    theme: 'teal'
  },
  {
    key: 'premium-trade',
    name: 'Premium Trade',
    desc: 'Luxurious burgundy / cream / gold trade document with elegant serif hierarchy.',
    layout: 'premium-trade',
    theme: 'burgundy'
  }
];

export function packingListTemplateFor(key) {
  return PACKING_LIST_TEMPLATES.find((t) => t.key === key) || null;
}

// Legacy shared template keys (the old 10-template Sales Document system) map
// to the closest new Packing List design so saved documents never break.
const LEGACY_TO_PACKING_LIST = {
  'modern-clean': 'global-trade-classic', // Classic Corporate → formal classic
  'corporate-grid': 'corporate-blue', // Editorial Minimal → corporate structure
  'elegant-framed': 'elegant-export', // Engineering Technical → elegant framed
  'split-header': 'dynamic-grid', // Modern Modular → modular grid
  'vertical-sidebar': 'elegant-borderless', // Luxury Fine-line → borderless
  'curved-accent': 'modern-logistics', // Dark Executive → compact logistics
  'premium-executive': 'dashboard-style', // Blueprint Industrial → data-rich
  'minimal-editorial': 'minimalist-erp', // Financial Report → minimal ERP
  'professional-corporate': 'modern-logistics', // Modern Technology → modern
  'global-engineering': 'timeline-shipment' // Architectural Grid → structured flow
};

/**
 * Normalize any stored template key to a valid Packing List template key.
 * New keys pass through untouched; legacy shared keys are mapped; anything
 * unknown falls back to the first (Global Trade Classic) design.
 */
export function normalizePackingListTemplate(key) {
  if (!key) return PACKING_LIST_TEMPLATES[0].key;
  if (packingListTemplateFor(key)) return key;
  return LEGACY_TO_PACKING_LIST[key] || PACKING_LIST_TEMPLATES[0].key;
}

// Auto Generate — deterministic per document (mirrors the shared helper but
// picks from the Packing List set). Same document always lands on the same
// design; only the visual design changes, never the document data.
function hashString(value) {
  let hash = 0;
  const str = String(value ?? '');
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function autoGeneratePackingListDesign(seed) {
  const hash = hashString(seed);
  return PACKING_LIST_TEMPLATES[hash % PACKING_LIST_TEMPLATES.length] || PACKING_LIST_TEMPLATES[0];
}