/**
 * Lead "Internal Notes" display helper.
 *
 * Some legacy CRM writes stored a technical metadata envelope inside the lead's
 * internal-notes column, for example:
 *
 *   {"__crmMeta":{"clientNo":"C-000076","openingBalance":0,"status":"Active"}}
 *
 * That value is stored and returned verbatim (the database, the entity and the
 * API contract are untouched), so this module separates the human-readable part
 * from the technical envelope at the presentation boundary only.
 *
 * parseInternalNotes() always returns { text, details }:
 *   - text    the plain note to render ('' when the value carries no note text)
 *   - details labelled [label, value] pairs worth showing ([] when there are none)
 *
 * Guarantees: never throws, never returns JSON text, and never exposes the raw
 * metadata object. Plain notes are returned unchanged; a malformed value falls
 * back to the original text instead of breaking the page.
 */
import { currencySymbol } from './currencyUtils.js';

/** Keys that hold an actual written note rather than machine metadata. */
const NOTE_KEYS = [
  'note',
  'notes',
  'internalnote',
  'internalnotes',
  'text',
  'comment',
  'comments',
  'summary',
  'description',
  'message',
  'body',
  'discussion'
];

const MONEY_KEY = /(balance|limit|amount|value|price|cost|total)/i;

function normalizeKey(key) {
  return String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** camelCase / snake_case / kebab-case → "Title Case". */
function humanizeLabel(key) {
  return String(key)
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function isBlankish(value) {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

/**
 * A metadata value that is itself JSON (e.g. linkedContacts stored as "[]") is
 * decoded once so empty collections disappear and real ones stay readable.
 * Returns undefined when the value is not embedded JSON.
 */
function decodeEmbedded(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!/^[[{]/.test(trimmed)) return undefined;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed !== null && typeof parsed === 'object' ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** Note text only — objects are never stringified into the note body. */
function asText(value) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => asText(item))
      .filter(Boolean)
      .join('\n')
      .trim();
  }
  return '';
}

/**
 * True when a parsed object is a technical metadata envelope rather than
 * business data: it carries an {@code __}-prefixed key (the real envelope is
 * written as {@code __crmMeta}) or an explicit {@code crmMeta} key.
 */
function isMetadataObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.keys(value).some((key) => String(key).trim().startsWith('__')
    || normalizeKey(key) === 'crmmeta');
}

/**
 * Just the technical keys of a parsed metadata object, or null when it has
 * none. Keeping only these keys is what lets a cleared note actually clear:
 * the written text lives beside them, not inside them.
 */
function technicalEnvelope(value) {
  if (!isMetadataObject(value)) return null;
  const entries = Object.entries(value).filter(([key]) => String(key).trim().startsWith('__')
    || normalizeKey(key) === 'crmmeta');
  return entries.length ? Object.fromEntries(entries) : null;
}

/**
 * The first balanced {...} block in `text` that PARSES as JSON *and* carries a
 * technical envelope key — the one shape that means "this is machine
 * metadata, not the note".
 *
 * Shared by both directions so there is exactly one scanner: the display path
 * removes what this finds, and the save path puts back exactly what it found.
 * Returns { start, end, parsed } or null when there is no such block.
 */
function findMetadataEnvelope(text) {
  if (typeof text !== 'string' || !text.includes('{')) return null;
  const start = text.indexOf('{');
  if (start === -1) return null;
  // Longest balanced candidate first, then progressively shorter ones.
  for (let end = text.lastIndexOf('}'); end > start; end = text.lastIndexOf('}', end - 1)) {
    let parsed;
    try {
      parsed = JSON.parse(text.slice(start, end + 1));
    } catch {
      continue;
    }
    if (!isMetadataObject(parsed)) continue;
    return { start, end, parsed };
  }
  return null;
}

/**
 * Removes a technical envelope that was appended to (or wrapped around) a
 * written note, where the value as a whole is therefore not valid JSON:
 *
 *   "Follow up with customer tomorrow\n{\"__crmMeta\":{...}}"
 *     → "Follow up with customer tomorrow"
 *
 * Only a balanced {...} block that PARSES as JSON *and* carries a technical
 * key is removed, so ordinary prose braces ("Budget is {approx} 5L") and
 * malformed snippets are returned untouched.
 */
function stripEmbeddedMetadata(value) {
  if (typeof value !== 'string' || !value.includes('{')) return value;
  let text = value;
  // Bounded: each pass removes at most one envelope.
  for (let pass = 0; pass < 5; pass += 1) {
    const found = findMetadataEnvelope(text);
    if (!found) break;
    text = `${text.slice(0, found.start)}${text.slice(found.end + 1)}`;
  }
  return text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** One readable line for a metadata value (arrays/objects flattened, never JSON). */
function formatValue(key, value, currency) {
  if (isBlankish(value)) return '';
  if (Array.isArray(value)) {
    return value
      .map((item) => (item && typeof item === 'object' ? formatObject(item, currency) : formatValue(key, item, currency)))
      .filter(Boolean)
      .join(', ');
  }
  if (value && typeof value === 'object') return formatObject(value, currency);

  const embedded = decodeEmbedded(value);
  if (embedded !== undefined) return formatValue(key, embedded, currency);

  if (typeof value === 'number' && Number.isFinite(value)) {
    return MONEY_KEY.test(key)
      ? `${currencySymbol(currency)}${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
      : value.toLocaleString('en-IN');
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value).trim();
}

function formatObject(object, currency) {
  return Object.entries(object)
    .map(([key, value]) => {
      const text = formatValue(key, value, currency);
      return text ? `${humanizeLabel(key)}: ${text}` : '';
    })
    .filter(Boolean)
    .join(' · ');
}

/**
 * Splits one level of a metadata object into written notes and everything else.
 * `__`-prefixed keys are technical envelopes: their contents are lifted up (so
 * the business fields stay readable) but the envelope key itself is dropped.
 */
function partition(entries) {
  const notes = [];
  const rest = [];
  for (const [key, raw] of entries) {
    const normalized = normalizeKey(key);
    // The technical envelope is written as "__crmMeta" (underscores are stripped
    // by normalizeKey, so the raw key decides) — and "crmMeta" is accepted too.
    if (String(key).trim().startsWith('__') || normalized === 'crmmeta') {
      const inner = decodeEmbedded(raw) ?? (raw && typeof raw === 'object' ? raw : null);
      if (inner && !Array.isArray(inner)) rest.push(...Object.entries(inner));
      continue;
    }
    if (NOTE_KEYS.includes(normalized)) {
      const text = asText(raw);
      if (text) notes.push(text);
      continue;
    }
    rest.push([key, raw]);
  }
  return { notes, rest };
}

function fromParsed(parsed) {
  if (parsed == null) return { text: '', details: [] };
  if (typeof parsed === 'string') return { text: stripEmbeddedMetadata(parsed), details: [] };
  if (typeof parsed === 'number' || typeof parsed === 'boolean') {
    return { text: String(parsed), details: [] };
  }
  if (Array.isArray(parsed)) {
    return {
      text: parsed
        .map((item) => asText(item))
        .filter(Boolean)
        .join('\n'),
      details: []
    };
  }

  // Two passes: the second lifts note keys out of a nested metadata envelope.
  const top = partition(Object.entries(parsed));
  const inner = partition(top.rest);
  const text = [...top.notes, ...inner.notes].filter(Boolean).join('\n').trim();

  const meta = Object.fromEntries(inner.rest);
  const currency = meta.currency || meta.currencyCode || 'INR';
  const details = inner.rest
    .map(([key, value]) => [humanizeLabel(key), formatValue(key, value, currency)])
    .filter(([, value]) => Boolean(value));

  return { text, details };
}

/**
 * Display text for any notes/remarks/meta column — the written text only.
 *
 * Same parser as Lead Detail ({@link parseInternalNotes}), exposed as a single
 * call so list cells and detail fields do not re-implement the envelope
 * handling: a technical CRM envelope is dropped, a written remark is kept, and
 * a value that carries no human-readable text comes back as '' so the caller
 * can render its own empty placeholder.
 */
export function notesDisplayText(value) {
  return parseInternalNotes(value).text;
}

/**
 * The technical envelope held by a stored notes value, as a plain object —
 * `null` when the value carries none.
 *
 * This is the save-side counterpart of the display parser: it uses the same
 * {@link isMetadataObject} detection, so whatever the form hides from the user
 * is exactly what {@link composeInternalNotes} puts back on save. The envelope
 * is returned verbatim (every key included) and is never mutated.
 *
 * Only the TECHNICAL keys are returned. A written note stored in the same JSON
 * object (`{ …, "notes": "…" }`) is deliberately not part of the envelope: it
 * is the user's text, so an edit — including clearing the field — must win.
 *
 * Handles the shapes the notes column actually contains: a whole-value JSON
 * object, a JSON string, a note with an envelope appended below it, and a
 * malformed value (which yields null — the caller keeps the text untouched).
 */
export function internalNotesMeta(value) {
  if (value == null) return null;
  if (typeof value === 'object') return technicalEnvelope(value);

  const raw = String(value);
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      const envelope = technicalEnvelope(parsed);
      if (envelope) return envelope;
    } catch {
      /* not whole-value JSON — the embedded-envelope scan below decides */
    }
  }
  const found = findMetadataEnvelope(raw);
  return found ? technicalEnvelope(found.parsed) : null;
}

/**
 * Rebuilds the value to store in a notes column after the user edited the
 * visible note, so nothing the technical envelope holds is ever lost:
 *
 *   no envelope           → the edited text, exactly as typed (unchanged)
 *   envelope, no text     → the envelope alone (the legacy stored shape)
 *   envelope + text       → { …envelope, notes: <edited text> }
 *
 * The last shape is the one {@link parseInternalNotes} already reads back as a
 * written note plus its labelled details, so a saved record round-trips its
 * client number / currency / opening balance / credit limit / linked contacts
 * / shipping details / status instead of dropping them.
 */
export function composeInternalNotes(meta, text) {
  const note = text == null ? '' : String(text).trim();
  // No envelope (a brand-new or plain-text record): store the note verbatim.
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return note;
  const envelope = isMetadataObject(meta) ? meta : null;
  if (!envelope) return note;
  if (!note) return JSON.stringify(envelope);
  return JSON.stringify({ ...envelope, notes: note });
}

export function parseInternalNotes(value) {
  if (value == null) return { text: '', details: [] };
  // A bare scalar in the column is still a note; show it rather than dropping it.
  if (typeof value === 'number' || typeof value === 'boolean') {
    return { text: String(value), details: [] };
  }
  if (typeof value === 'object') return fromParsed(value);

  const raw = String(value);
  const trimmed = raw.trim();
  if (!trimmed) return { text: '', details: [] };
  // Object/array payloads are decoded; a value wrapped in quotes is unwrapped
  // once so an escaped note reads as plain text. Anything else is a plain note
  // and is never transformed.
  const looksStructured = /^[[{]/.test(trimmed);
  const looksQuoted = trimmed.length > 1 && trimmed.startsWith('"') && trimmed.endsWith('"');
  if (!looksStructured && !looksQuoted) {
    // Prose that merely has an envelope appended to it ("remark + {\"__crmMeta\":…}")
    // is not JSON as a whole: keep the remark, drop the technical block.
    return { text: stripEmbeddedMetadata(raw), details: [] };
  }
  try {
    return fromParsed(JSON.parse(trimmed));
  } catch {
    // Malformed JSON: show the original text, never crash the detail page.
    return { text: stripEmbeddedMetadata(raw), details: [] };
  }
}

export default parseInternalNotes;
