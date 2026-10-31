// ============================================================================
// Proforma Invoice design system — 10 dedicated Proforma Invoice templates.
//
// These REPLACE the shared Sales-Document template set for the Proforma
// Invoice module. Each template is a genuinely different A4 composition
// (typography, header architecture, card system, table, financial summary,
// signature and footer) — not a colour theme of one layout. The palette is
// part of each design, so no separate colour-theme selector is offered for
// the Proforma module.
//
// The renderer stays the same (ProformaInvoiceDocument + proforma-templates.css)
// so Preview = Print = PDF by construction. Stored template keys are preserved:
// legacy records saved with an old shared template key (e.g. 'modern-clean')
// are mapped to the closest new design via normalizeProformaTemplate, and the
// new key is written back when the document is saved again.
// ============================================================================

export const PROFORMA_TEMPLATES = [
  {
    key: 'minimalist-professional',
    name: 'Minimalist Professional',
    desc: 'Clean premium whitespace, hairline dividers, elegant minimal typography.',
    layout: 'minimalist-professional',
    theme: 'vishak'
  },
  {
    key: 'elegant-corporate',
    name: 'Elegant Corporate',
    desc: 'Formal navy & gold corporate masthead with structured information areas.',
    layout: 'elegant-corporate',
    theme: 'navy'
  },
  {
    key: 'creative-portfolio',
    name: 'Creative Portfolio',
    desc: 'Bold asymmetric composition with teal / coral / yellow accents.',
    layout: 'creative-portfolio',
    theme: 'teal'
  },
  {
    key: 'modern-resume',
    name: 'Modern Resume',
    desc: 'Two-column architecture with a strong vertical information rail.',
    layout: 'modern-resume',
    theme: 'charcoal'
  },
  {
    key: 'academic-report',
    name: 'Academic Report',
    desc: 'Formal serif report with numbered sections and structured tables.',
    layout: 'academic-report',
    theme: 'slate'
  },
  {
    key: 'marketing-brochure',
    name: 'Marketing Brochure',
    desc: 'Diagonal geometry and bold panels with controlled orange / cyan accents.',
    layout: 'marketing-brochure',
    theme: 'charcoal'
  },
  {
    key: 'financial-dashboard',
    name: 'Financial Dashboard',
    desc: 'Data-heavy dark report with KPI-style financial blocks.',
    layout: 'financial-dashboard',
    theme: 'charcoal'
  },
  {
    key: 'travel-guide',
    name: 'Travel Guide',
    desc: 'Earthy sectioned layout with strong location and shipment hierarchy.',
    layout: 'travel-guide',
    theme: 'teal'
  },
  {
    key: 'event-program',
    name: 'Event Program',
    desc: 'Restrained burgundy / gold / cream program-style composition.',
    layout: 'event-program',
    theme: 'burgundy'
  },
  {
    key: 'startup-pitch-deck',
    name: 'Startup Pitch Deck',
    desc: 'Modern technology blocks with purple-blue / teal-pink accents.',
    layout: 'startup-pitch-deck',
    theme: 'royal'
  }
];

export function proformaTemplateFor(key) {
  return PROFORMA_TEMPLATES.find((t) => t.key === key) || null;
}

// Legacy shared template keys (the old 10-template Sales Document system) map
// to the closest new Proforma design so saved documents never break.
const LEGACY_TO_PROFORMA = {
  'modern-clean': 'elegant-corporate', // Classic Corporate → formal corporate
  'corporate-grid': 'minimalist-professional', // Editorial Minimal → minimal
  'elegant-framed': 'financial-dashboard', // Engineering Technical → data-heavy
  'split-header': 'startup-pitch-deck', // Modern Modular → modular technology
  'vertical-sidebar': 'event-program', // Luxury Fine-line → elegant framed
  'curved-accent': 'financial-dashboard', // Dark Executive → dark dashboard
  'premium-executive': 'marketing-brochure', // Blueprint Industrial → bold geometry
  'minimal-editorial': 'academic-report', // Financial Report → formal report
  'professional-corporate': 'startup-pitch-deck', // Modern Technology → tech
  'global-engineering': 'travel-guide' // Architectural Grid → structured grid
};

/**
 * Normalize any stored template key to a valid Proforma template key.
 * New keys pass through untouched; legacy shared keys are mapped; anything
 * unknown falls back to the first (Minimalist Professional) design.
 */
export function normalizeProformaTemplate(key) {
  if (!key) return PROFORMA_TEMPLATES[0].key;
  if (proformaTemplateFor(key)) return key;
  return LEGACY_TO_PROFORMA[key] || PROFORMA_TEMPLATES[0].key;
}

// Auto Generate — deterministic per document (mirrors the shared helper but
// picks from the Proforma set). Same document always lands on the same design.
function hashString(value) {
  let hash = 0;
  const str = String(value ?? '');
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function autoGenerateProformaDesign(seed) {
  const hash = hashString(seed);
  return PROFORMA_TEMPLATES[hash % PROFORMA_TEMPLATES.length] || PROFORMA_TEMPLATES[0];
}