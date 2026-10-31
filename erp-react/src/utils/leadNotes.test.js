/**
 * utils/leadNotes.test.js
 * ------------------------------------------------------------------
 * Tests for the Lead Detail "Internal Notes" display parser.
 *
 * The regression this guards: legacy CRM writes stored a technical
 * envelope in the notes column —
 *   {"__crmMeta":{"clientNo":"C-000076","openingBalance":0,...}}
 * — and Lead Detail → Other Information rendered that blob verbatim.
 *
 * The stored value, the entity and the API are unchanged: only the
 * presentation is split into a written note plus labelled details. These
 * cases pin the guarantees — never throw, never return JSON text, never
 * drop a plain note.
 * ------------------------------------------------------------------
 */
import { describe, expect, it } from 'vitest';
import {
  composeInternalNotes,
  internalNotesMeta,
  notesDisplayText,
  parseInternalNotes
} from './leadNotes';

/** Shapes taken from the live leads table (ids 75 and 76). */
const CRM_META_ONLY =
  '{"__crmMeta":{"clientNo":"C-000076","openingBalance":0,"creditLimit":0,'
  + '"currency":"INR","linkedContacts":"[]","shippingDetails":"[]","status":"Active"}}';
const LEAD_META_ONLY = '{"__crmMeta":{"leadNo":"LEAD-000054","priority":"medium"}}';

describe('parseInternalNotes', () => {
  it('never returns raw JSON for a metadata-only value', () => {
    const { text, details } = parseInternalNotes(CRM_META_ONLY);

    expect(text).toBe('');
    expect(JSON.stringify(text)).not.toContain('__crmMeta');
    expect(details).toEqual([
      ['Client No', 'C-000076'],
      ['Opening Balance', '₹0'],
      ['Credit Limit', '₹0'],
      ['Currency', 'INR'],
      ['Status', 'Active']
    ]);
  });

  it('lifts the useful fields out of the envelope and drops empty collections', () => {
    const { details } = parseInternalNotes(CRM_META_ONLY);
    const labels = details.map(([label]) => label);

    expect(labels).not.toContain('Crm Meta');
    expect(labels).not.toContain('Linked Contacts');
    expect(labels).not.toContain('Shipping Details');
  });

  it('separates a written note from the metadata written alongside it', () => {
    const value = JSON.stringify({
      __crmMeta: { clientNo: 'C-000076', creditLimit: 500000, currency: 'INR' },
      notes: 'Called the client, asked for a revised quote.'
    });

    const { text, details } = parseInternalNotes(value);

    expect(text).toBe('Called the client, asked for a revised quote.');
    expect(details).toContainEqual(['Client No', 'C-000076']);
    expect(details).toContainEqual(['Credit Limit', '₹5,00,000']);
  });

  it('shows the lead-number envelope readably', () => {
    expect(parseInternalNotes(LEAD_META_ONLY).details).toEqual([
      ['Lead No', 'LEAD-000054'],
      ['Priority', 'medium']
    ]);
  });

  it('returns a plain note unchanged', () => {
    const note = 'Follow up next Tuesday about the AMC renewal.';
    expect(parseInternalNotes(note)).toEqual({ text: note, details: [] });
  });

  it('does not treat a note that merely contains braces as JSON', () => {
    const note = 'Budget is {approx} 5L — confirm.';
    expect(parseInternalNotes(note)).toEqual({ text: note, details: [] });
  });

  it('falls back to the original text when the JSON is malformed', () => {
    const broken = '{"__crmMeta":{"clientNo": }';
    expect(() => parseInternalNotes(broken)).not.toThrow();
    expect(parseInternalNotes(broken)).toEqual({ text: broken, details: [] });
  });

  it('handles empty, null and non-string values without throwing', () => {
    expect(parseInternalNotes('')).toEqual({ text: '', details: [] });
    expect(parseInternalNotes('   ')).toEqual({ text: '', details: [] });
    expect(parseInternalNotes(null)).toEqual({ text: '', details: [] });
    expect(parseInternalNotes(undefined)).toEqual({ text: '', details: [] });
    expect(parseInternalNotes(42)).toEqual({ text: '42', details: [] });
  });

  it('never emits the envelope key even for a key-only payload', () => {
    const label = parseInternalNotes('{"crmMeta":{"status":"Active"}}').details;
    expect(label).toEqual([['Status', 'Active']]);
  });
});

/**
 * The Follow-ups list Remarks column renders the same column through
 * notesDisplayText() — the regression it guards is the raw envelope showing up
 * as user-facing text (followups.discussion_summary row for LEAD-000076).
 */
describe('notesDisplayText', () => {
  it('returns nothing for a metadata-only value (cell falls back to —)', () => {
    expect(notesDisplayText(CRM_META_ONLY)).toBe('');
  });

  it('keeps the written remark and drops the envelope beside it', () => {
    expect(notesDisplayText(`Follow up with customer tomorrow\n${CRM_META_ONLY}`))
      .toBe('Follow up with customer tomorrow');
  });

  it('returns a plain remark unchanged', () => {
    const note = 'Customer requested quotation.';
    expect(notesDisplayText(note)).toBe(note);
  });

  it('does not treat braces in prose as JSON', () => {
    const note = 'Budget is {approx} 5L — confirm.';
    expect(notesDisplayText(note)).toBe(note);
  });

  it('falls back to the original value when the JSON is malformed', () => {
    const broken = '{"__crmMeta":{"clientNo": }';
    expect(() => notesDisplayText(broken)).not.toThrow();
    expect(notesDisplayText(broken)).toBe(broken);
  });

  it('returns nothing for null / empty values', () => {
    expect(notesDisplayText(null)).toBe('');
    expect(notesDisplayText(undefined)).toBe('');
    expect(notesDisplayText('')).toBe('');
    expect(notesDisplayText('   ')).toBe('');
  });

  it('never returns JSON text for metadata holding arrays/objects', () => {
    const value = '{"__crmMeta":{"clientNo":"C-000076","linkedContacts":"[]",'
      + '"shippingDetails":"[]","nested":{"a":1},"list":[1,2]}}';
    const text = notesDisplayText(value);
    expect(text).toBe('');
    expect(text).not.toContain('{');
    expect(text).not.toContain('__crmMeta');
    expect(text).not.toContain('[]');
  });
});

/**
 * The edit form must not show the envelope and must not drop it either:
 * internalNotesMeta() finds what the form hides, composeInternalNotes() puts
 * exactly that back on save. Together they are the round trip the Lead Edit
 * form relies on (textarea ← parseInternalNotes, payload ← composeInternalNotes).
 */
describe('internalNotesMeta', () => {
  it('returns the envelope of a metadata-only value', () => {
    expect(internalNotesMeta(CRM_META_ONLY)).toEqual({
      __crmMeta: {
        clientNo: 'C-000076',
        openingBalance: 0,
        creditLimit: 0,
        currency: 'INR',
        linkedContacts: '[]',
        shippingDetails: '[]',
        status: 'Active'
      }
    });
  });

  it('finds an envelope appended below a written note', () => {
    const meta = internalNotesMeta(`Called the client.\n${CRM_META_ONLY}`);
    expect(meta.__crmMeta.clientNo).toBe('C-000076');
  });

  it('returns null for a plain note, empty values and malformed JSON', () => {
    expect(internalNotesMeta('Follow up next Tuesday.')).toBeNull();
    expect(internalNotesMeta('Budget is {approx} 5L — confirm.')).toBeNull();
    const broken = '{"__crmMeta":{"clientNo": }';
    expect(() => internalNotesMeta(broken)).not.toThrow();
    expect(internalNotesMeta(broken)).toBeNull();
    expect(internalNotesMeta(null)).toBeNull();
    expect(internalNotesMeta(undefined)).toBeNull();
    expect(internalNotesMeta('')).toBeNull();
    expect(internalNotesMeta('   ')).toBeNull();
  });
});

describe('composeInternalNotes', () => {
  it('stores a plain note verbatim when there is no envelope', () => {
    expect(composeInternalNotes(null, 'Customer requested revised quotation.'))
      .toBe('Customer requested revised quotation.');
    expect(composeInternalNotes(undefined, '  padded  ')).toBe('padded');
    expect(composeInternalNotes(null, '')).toBe('');
    expect(composeInternalNotes(null, null)).toBe('');
  });

  it('keeps the whole envelope when the user wrote nothing', () => {
    const stored = composeInternalNotes(internalNotesMeta(CRM_META_ONLY), '');

    expect(stored).toContain('__crmMeta');
    const { text, details } = parseInternalNotes(stored);
    expect(text).toBe('');
    expect(details).toContainEqual(['Client No', 'C-000076']);
    expect(details).toContainEqual(['Credit Limit', '₹0']);
  });

  it('round-trips text and every metadata key after an edit', () => {
    const stored = composeInternalNotes(
      internalNotesMeta(CRM_META_ONLY),
      'Called the client, asked for a revised quote.'
    );

    const { text, details } = parseInternalNotes(stored);
    expect(text).toBe('Called the client, asked for a revised quote.');
    expect(details).toContainEqual(['Client No', 'C-000076']);
    expect(details).toContainEqual(['Currency', 'INR']);
    expect(details).toContainEqual(['Status', 'Active']);

    // Nothing the envelope held is lost — compared on the stored value itself.
    const original = JSON.parse(CRM_META_ONLY);
    expect(JSON.parse(stored).__crmMeta).toEqual(original.__crmMeta);
  });

  it('never shows the user raw JSON through the display path', () => {
    const stored = composeInternalNotes(internalNotesMeta(CRM_META_ONLY), 'Chase the PO.');
    expect(notesDisplayText(stored)).toBe('Chase the PO.');
  });

  it('leaves the written note out of the envelope it preserves', () => {
    const value = JSON.stringify({
      __crmMeta: { clientNo: 'C-000076' },
      notes: 'Called the client.'
    });

    expect(internalNotesMeta(value)).toEqual({ __crmMeta: { clientNo: 'C-000076' } });
  });

  it('clears the note when the user empties the field', () => {
    const previous = JSON.stringify({
      __crmMeta: { clientNo: 'C-000076', status: 'Active' },
      notes: 'Called the client.'
    });
    expect(parseInternalNotes(previous).text).toBe('Called the client.');

    // The form hydrates from the stored value, the user clears it, and the
    // composed value must not resurrect the text from the old envelope.
    const stored = composeInternalNotes(internalNotesMeta(previous), '');

    expect(parseInternalNotes(stored).text).toBe('');
    expect(JSON.parse(stored)).toEqual({ __crmMeta: { clientNo: 'C-000076', status: 'Active' } });
  });

  it('upgrades prose-plus-envelope rows so their details survive a save', () => {
    // Legacy shape: the note text followed by the envelope below it. Only the
    // text was previously readable, and the envelope would have been dropped.
    const legacy = `Called the client.\n${CRM_META_ONLY}`;
    expect(notesDisplayText(legacy)).toBe('Called the client.');

    const stored = composeInternalNotes(internalNotesMeta(legacy), notesDisplayText(legacy));
    const { text, details } = parseInternalNotes(stored);

    expect(text).toBe('Called the client.');
    expect(details).toContainEqual(['Client No', 'C-000076']);
  });
});
