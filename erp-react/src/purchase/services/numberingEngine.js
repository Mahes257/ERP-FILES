/**
 * purchase/services/numberingEngine.js
 * ------------------------------------------------------------------
 * Central ERP numbering engine.
 *
 * Every business document owns an independent sequence configured in
 * Settings → Document Numbering:
 *
 *   PR · RFQ · Quotation · Award · PO · Packing · Shipment · GRN ·
 *   Inspection · Inventory Movement · Vendor Invoice · Payment ·
 *   Payment Advice · Credit Note · Debit Note
 *
 * Each sequence supports: Prefix · Year (FY) · Starting Number ·
 * Current Number · Padding · Reset Policy ('never' | 'fiscal-year').
 *
 * Guarantees:
 *   · Duplicate prevention — every issued number is appended to a
 *     persistent per-sequence ledger and checked against existing
 *     records, so a number can never be issued twice even if records
 *     are edited or deleted.
 *   · Prefix separation — Inventory Movement (INV) and Vendor Invoice
 *     (VINV) ship with distinct prefixes; `validatePrefixes` flags any
 *     accidental prefix collision across sequences.
 *   · Fiscal-year reset — a sequence with resetPolicy 'fiscal-year'
 *     restarts at its starting number when the year changes.
 *
 * This module is PURE (no storage access) so it is trivially testable;
 * settings.js owns the persisted blob and delegates here.
 * ------------------------------------------------------------------ */

/** Reset policies. 'never' = counter only advances; 'fiscal-year' =
 *  the sequence restarts when the (FY) year changes. */
export const RESET_POLICIES = ['never', 'fiscal-year'];

/** Canonical sequences. Keys are the Settings doc-type keys; `label`
 *  is the human name shown in the panel. Prefixes are deliberately
 *  distinct — especially Inventory Movement (INV) vs Vendor Invoice
 *  (VINV), which must never share a namespace. */
export const NUMBERING_SEQUENCES = {
  PR: { label: 'Purchase Requisition', prefix: 'PR', fy: '2026', startNo: 1, currentNo: 45, padding: 4, resetPolicy: 'never' },
  RFQ: { label: 'Request for Quotation', prefix: 'RFQ', fy: '2026', startNo: 1, currentNo: 22, padding: 4, resetPolicy: 'never' },
  Quotation: { label: 'Quotation', prefix: 'QT', fy: '2026', startNo: 1, currentNo: 38, padding: 3, resetPolicy: 'never', plain: true },
  Award: { label: 'Award', prefix: 'AWD', fy: '2026', startNo: 1, currentNo: 12, padding: 4, resetPolicy: 'never' },
  PO: { label: 'Purchase Order', prefix: 'PO', fy: '2026', startNo: 1, currentNo: 18, padding: 4, resetPolicy: 'never' },
  Packing: { label: 'Packing / Manufacturing', prefix: 'MFR', fy: '2026', startNo: 1, currentNo: 10, padding: 4, resetPolicy: 'never' },
  Shipment: { label: 'Shipment', prefix: 'SHP', fy: '2026', startNo: 1, currentNo: 9, padding: 4, resetPolicy: 'never' },
  GRN: { label: 'Goods Receipt Note', prefix: 'GRN', fy: '2026', startNo: 1, currentNo: 12, padding: 4, resetPolicy: 'never' },
  Inspection: { label: 'Quality Inspection', prefix: 'QC', fy: '2026', startNo: 1, currentNo: 32, padding: 4, resetPolicy: 'never' },
  'Inventory Movement': { label: 'Inventory Movement', prefix: 'INV', fy: '2026', startNo: 1, currentNo: 5, padding: 3, resetPolicy: 'never' },
  'Vendor Invoice': { label: 'Vendor Invoice', prefix: 'VINV', fy: '2026', startNo: 1, currentNo: 15, padding: 4, resetPolicy: 'never' },
  Payment: { label: 'Payment', prefix: 'PAY', fy: '2026', startNo: 1, currentNo: 10, padding: 4, resetPolicy: 'never' },
  'Payment Advice': { label: 'Payment Advice', prefix: 'ADV', fy: '2026', startNo: 1, currentNo: 0, padding: 4, resetPolicy: 'never' },
  'Credit Note': { label: 'Credit Note', prefix: 'CN', fy: '2026', startNo: 1, currentNo: 0, padding: 4, resetPolicy: 'never' },
  'Debit Note': { label: 'Debit Note', prefix: 'DN', fy: '2026', startNo: 1, currentNo: 0, padding: 4, resetPolicy: 'never' }
};

export const NUMBERING_DOC_TYPES = Object.keys(NUMBERING_SEQUENCES);

/** Legacy keys renamed in this engine — existing persisted settings
 *  migrate their values into the canonical names. */
const LEGACY_KEY_MAP = {
  Inventory: 'Inventory Movement',
  Invoice: 'Vendor Invoice'
};

export function sequenceDefaults(docType) {
  return cloneOf(NUMBERING_SEQUENCES[docType] || null);
}

function cloneOf(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value;
}

/** Merge defaults into a stored numbering map; migrate legacy keys.
 *  Existing values (custom prefixes, counters, ledgers) are preserved. */
export function ensureSequences(numbering = {}) {
  const src = (numbering && typeof numbering === 'object') ? numbering : {};
  const next = { ...src };
  let changed = false;

  /* Migrate legacy keys first. */
  Object.entries(LEGACY_KEY_MAP).forEach(([legacy, canonical]) => {
    if (next[legacy] && !next[canonical]) {
      next[canonical] = { ...next[legacy] };
      delete next[legacy];
      changed = true;
    }
  });

  /* Fill any missing canonical sequence from defaults. */
  Object.entries(NUMBERING_SEQUENCES).forEach(([key, cfg]) => {
    if (!next[key]) {
      next[key] = cloneOf(cfg);
      changed = true;
    }
  });

  /* Migrate Quotation sequence to plain format (QT-001 instead of
     QT-YYYY-NNNN) when the old year-based format is detected. */
  if (next.Quotation && !next.Quotation.plain) {
    next.Quotation = { ...cloneOf(NUMBERING_SEQUENCES.Quotation), currentNo: 0, issued: [] };
    changed = true;
  }

  return changed ? next : src;
}

/** Read one sequence config (migrated + defaulted), or null. */
export function getSequence(numbering, docType) {
  const normalized = ensureSequences(numbering);
  return normalized[docType] ? cloneOf(normalized[docType]) : null;
}

/** Numbers already issued (ledger) plus provided existing numbers. */
function usedNumbers(sequence, existing = []) {
  const used = new Set();
  (Array.isArray(sequence.issued) ? sequence.issued : []).forEach((n) => used.add(String(n)));
  (Array.isArray(existing) ? existing : []).forEach((n) => {
    if (n !== null && n !== undefined && n !== '') used.add(String(n));
  });
  return used;
}

/**
 * Compute the next document number for a sequence.
 *
 *   numbering — persisted numbering map
 *   docType   — canonical sequence key (see NUMBERING_DOC_TYPES)
 *   existing  — numbers already present on stored records for the type
 *   now       — Date (defaults to current time; used for FY rollover)
 *
 * Returns { number, sequence } — `sequence` is the pre-issue state
 * (counter not yet advanced) so callers can persist exactly one ledger
 * entry via recordIssued().
 */
export function computeNext(numbering, docType, { existing = [], now } = {}) {
  const seq = getSequence(numbering, docType);
  if (!seq) throw new Error(`No numbering sequence configured for "${docType}"`);
  const date = now || new Date();
  const currentYear = String(date.getFullYear());
  const pad = Math.max(1, Number(seq.padding) || 4);
  const start = Math.max(0, Number(seq.startNo) || 1);
  let { prefix, fy, currentNo } = seq;
  let issued = Array.isArray(seq.issued) ? seq.issued : [];

  /* Fiscal-year reset: the sequence restarts when the FY changes. */
  if (seq.resetPolicy === 'fiscal-year' && fy && fy !== currentYear) {
    fy = currentYear;
    currentNo = 0;
    issued = [];
  }
  const year = fy || currentYear;

  const used = usedNumbers({ ...seq, issued }, existing);
  /* For plain sequences (e.g. QT-001), only scan numbers matching
     the plain pattern; old year-based numbers are ignored. */
  const plainRe = seq.plain ? new RegExp(`^${prefix}-(\d+)$`) : null;
  const scanned = existing
    .filter((n) => {
      if (!n) return false;
      if (plainRe) return plainRe.test(String(n));
      return true;
    })
    .map((n) => {
      const s = String(n);
      const m = plainRe && plainRe.exec(s);
      if (m) return Number(m[1]);
      return Number(s.split('-').pop());
    })
    .filter((num) => Number.isFinite(num));
  const base = Math.max(
    scanned.length ? Math.max(...scanned) : 0,
    Number(currentNo) || 0,
    start - 1
  );
  let next = base + 1;
  let candidate = seq.plain
    ? `${prefix}-${String(next).padStart(pad, '0')}`
    : `${prefix}-${year}-${String(next).padStart(pad, '0')}`;
  while (used.has(candidate)) {
    next += 1;
    candidate = seq.plain
      ? `${prefix}-${String(next).padStart(pad, '0')}`
      : `${prefix}-${year}-${String(next).padStart(pad, '0')}`;
  }
  return {
    number: candidate,
    sequence: { ...seq, prefix, fy: year, currentNo, issued }
  };
}

/** Record an issued number: bumps the counter and appends to the
 *  duplicate-prevention ledger (capped so storage stays bounded). */
export function recordIssued(numbering, docType, number) {
  const seq = getSequence(numbering, docType);
  if (!seq) return numbering;
  const seqNo = Number(String(number || '').split('-').pop());
  const ledger = Array.isArray(seq.issued) ? seq.issued : [];
  const next = {
    ...seq,
    currentNo: Math.max(Number(seq.currentNo) || 0, Number.isFinite(seqNo) ? seqNo : 0),
    issued: [...ledger, String(number)].slice(-1000)
  };
  return { ...numbering, [docType]: next };
}

/** Reset a sequence's counter (and ledger) — used by the per-row
 *  "Reset" action and the fiscal-year rollover. Returns a new map. */
export function resetSequence(numbering, docType) {
  const seq = getSequence(numbering, docType);
  if (!seq) return numbering;
  return {
    ...numbering,
    [docType]: { ...seq, currentNo: 0, issued: [] }
  };
}

/** Validate the whole map: duplicate prefixes across sequences are an
 *  error (the INV/VINV collision rule is a special case of this). */
export function validatePrefixes(numbering = {}) {
  const normalized = ensureSequences(numbering);
  const seen = new Map();
  const errors = [];
  NUMBERING_DOC_TYPES.forEach((docType) => {
    const seq = normalized[docType];
    if (!seq || !seq.prefix) return;
    const prefix = String(seq.prefix).trim().toUpperCase();
    if (!prefix) return;
    if (seen.has(prefix)) {
      errors.push(
        `Prefix "${prefix}" is shared by "${seen.get(prefix)}" and "${docType}" — every document type needs its own prefix.`
      );
    } else {
      seen.set(prefix, docType);
    }
  });
  return errors;
}