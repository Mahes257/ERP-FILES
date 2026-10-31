/**
 * gridColumns.js — the reusable column-management model shared by every
 * editable/manageable/resizable grid in Sales & Marketing.
 * ------------------------------------------------------------------
 * One column shape everywhere:
 *   { id, key, label, type, required, system, hidden, width, order }
 *   - system: structural/business column wired to real fields — cannot be
 *     removed; can be renamed, reordered, hidden, resized (except protected
 *     structural columns like serial number / Actions, which stay fixed).
 *   - custom: user-defined column; its per-row values ride with the row's
 *     customFields object keyed by the column's stable id. Never derived from
 *     the label, so renaming never orphanes data.
 *
 * Persistence: loadGridConfig/saveGridConfig (gridConfigService) → MySQL
 * app_settings. Per-document grids (CPR today; the same JSON rides inside the
 * document payload where the backend already accepts it) keep storing the
 * SAME shape inside the document itself.
 *
 * Widths: every data column is drag-resizable with a floor of 60px and a
 * ceiling of 900px so a column can always be made readable again. Serial
 * number (#) and Actions stay compact/fixed by design.
 */

/** Sensible global width bounds for drag-resize. */
export const COLUMN_MIN_WIDTH = 60;
export const COLUMN_MAX_WIDTH = 900;

/** Structural columns that must stay protected (serial no, actions, grip). */
const PROTECTED_KEYS = new Set(['sno', 'index', 'actions', 'grip', 'checkbox']);

export function isProtectedColumn(col) {
  return PROTECTED_KEYS.has(String(col?.key || ''));
}

/** Clamp a requested width into the allowed band. */
export function clampColumnWidth(width) {
  const n = Math.round(Number(width));
  if (!Number.isFinite(n)) return COLUMN_MIN_WIDTH;
  return Math.min(COLUMN_MAX_WIDTH, Math.max(COLUMN_MIN_WIDTH, n));
}

let customColumnSeq = 0;

/** Stable id for a user-defined column (never derived from its label). */
export function newCustomColumnId(prefix = 'custom') {
  customColumnSeq += 1;
  return `${prefix}_${Date.now().toString(36)}_${customColumnSeq}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Does this configuration contain at least one user-defined column? */
export function hasCustomColumns(columns) {
  return (columns || []).some((c) => c && !c.system);
}

/**
 * Normalize ONE default column definition into the canonical shape.
 * List pages and item grids already declare columns as
 *   { key, label, width, mandatory, always, sortable, align, ... }
 * so the defaults are upgraded in place: `key` doubles as the stable `id`,
 * `mandatory`/`always` mean the column can never be removed, and any extra
 * renderer metadata (align/sortable/loaderWidth/…) is preserved untouched.
 */
export function normalizeDefaultColumn(def, index) {
  const id = def.id || def.key || `col_${index + 1}`;
  return {
    ...def,
    id,
    key: def.key || id,
    label: def.label != null ? def.label : id,
    type: def.type || 'text',
    required: Boolean(def.required ?? def.mandatory),
    system: def.system !== undefined ? Boolean(def.system) : !def.custom,
    hidden: Boolean(def.hidden ?? (def.visible === false)),
    // No declared width means "auto" (the table's own layout decides) — this is
    // how the CRM/auto-layout tables keep their existing proportions until the
    // user actually drags a column, which then pins an explicit width.
    width: def.width != null ? clampColumnWidth(def.width) : null,
    order: Number.isFinite(def.order) ? def.order : index + 1
  };
}

/**
 * Sanitize a saved/loaded column list: dedupe ids, coerce types, clamp widths,
 * keep `order` dense and 1-based, and re-append any default system column the
 * saved config lacks (schema-drift safety — mirrors CPR's normalizeCprItemColumns).
 * Also normalizes the DEFAULT definitions themselves, so any grid can hand in
 * its existing column array (with or without ids) and get the canonical shape.
 */
export function normalizeGridColumns(raw, defaults) {
  const src = typeof defaults === 'function' ? defaults() : defaults;
  const defs = (Array.isArray(src) ? src : []).map(normalizeDefaultColumn);
  const defById = new Map(defs.map((d) => [d.id, d]));
  if (!Array.isArray(raw) || raw.length === 0) return defs.map((c) => ({ ...c }));
  const seen = new Set();
  const cleaned = [];
  /** id → order actually used for a saved column (for drift insertion below). */
  const orderById = new Map();
  raw.forEach((c, i) => {
    if (!c || typeof c !== 'object') return;
    const id = typeof c.id === 'string' && c.id ? c.id : null;
    if (!id || seen.has(id)) return;
    seen.add(id);
    const def = defById.get(id);
    const order = Number.isFinite(c.order) ? c.order : i;
    orderById.set(id, order);
    cleaned.push({
      ...(def || {}),
      ...c,
      id,
      key: typeof c.key === 'string' && c.key ? c.key : (def?.key || id),
      label: typeof c.label === 'string' && c.label.trim() ? c.label.trim() : (def?.label || id),
      type: typeof c.type === 'string' && c.type ? c.type : (def?.type || 'text'),
      // A default flagged mandatory/required can never lose its required flag.
      required: Boolean(c.required ?? def?.required),
      system: Boolean(c.system ?? def?.system),
      // Missing flag (legacy rows) means visible.
      hidden: Boolean(c.hidden),
      width: c.width != null
        ? clampColumnWidth(c.width)
        : (def?.width != null ? def.width : null),
      order
    });
  });
  // Re-append default columns the saved config is missing (schema-drift safety),
  // but put each one WHERE ITS DEFAULT DEFINITION PUTS IT instead of blindly at
  // the end. A column the application adds to the defaults later (Follow-up
  // Status / PO Status on the quotation list, for example) then lands in its
  // intended slot — and never after the pinned Actions column, which must stay
  // last, whatever the saved config predates.
  // The pinned trailing column (Actions) must stay last. A saved column that
  // comes AFTER it can only be there because an older version of this function
  // appended later-added defaults at the very end — a human reorder can never
  // put a column past the pinned Actions column. Those columns are therefore
  // treated as drifted and re-placed at their default position. Without this,
  // Follow-up Status / PO Status ended up rendering after Actions.
  const trailingDef = defs.length ? defs[defs.length - 1] : null;
  const trailingOrder = trailingDef ? orderById.get(trailingDef.id) : undefined;
  const drifted = new Set();
  if (trailingOrder != null) {
    cleaned.forEach((c) => {
      if (c.id !== trailingDef.id && defById.has(c.id) && orderById.get(c.id) > trailingOrder) {
        drifted.add(c.id);
      }
    });
  }

  // Default columns that are still in place, by default index — the anchors the
  // missing / drifted columns are positioned between.
  const placed = defs
    .map((d, i) => (seen.has(d.id) && !drifted.has(d.id) ? { i, order: orderById.get(d.id) } : null))
    .filter(Boolean);

  defs.forEach((d, i) => {
    const missing = !seen.has(d.id);
    const isDrifted = drifted.has(d.id);
    if (!missing && !isDrifted) return;
    const prev = [...placed].reverse().find((p) => p.i < i);
    const next = placed.find((p) => p.i > i);
    let order;
    if (prev && next) order = (prev.order + next.order) / 2;
    else if (prev) order = prev.order + 0.5;
    else if (next) order = next.order - 0.5;
    else order = i + 1;
    placed.push({ i, order });
    placed.sort((a, b) => a.i - b.i);
    orderById.set(d.id, order);
    if (isDrifted) {
      const entry = cleaned.find((c) => c.id === d.id);
      if (entry) entry.order = order;
    } else {
      cleaned.push({ ...d, order });
    }
  });
  return cleaned.sort((a, b) => a.order - b.order).map((c, i) => ({ ...c, order: i + 1 }));
}

/** Protected structural columns can be hidden? No — they stay visible. */
export function canHideColumn(col) {
  return !(isProtectedColumn(col) || col?.always);
}
