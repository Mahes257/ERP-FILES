/**
 * credit-note-kanban.test.js
 * ------------------------------------------------------------------
 * The Credit Notes list offers the same List/Kanban presentation toggle as the
 * Sales Contract / Sales Order boards. This locks in the pieces that make it
 * safe:
 *
 *   1. the toggle exists for Credit Notes and the credit-note config enables it;
 *   2. the board's columns are the module's own status values (the Status
 *      filter options) plus the Archived / Deleted buckets — never invented
 *      states, and never a separate data source;
 *   3. the card's move targets are limited to the statuses the Credit Note
 *      backend really persists (CreditNoteService.normalizeStatus rewrites
 *      everything else to 'draft'), so no board action can silently write the
 *      wrong status;
 *   4. the Sales Order board — the module that introduced the shared board —
 *      keeps its exact card fields.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(here, '..', rel), 'utf8');

const PAGE = 'src/components/SalesTable/SalesListPage.jsx';
const CONFIG = 'src/config/salesPageConfigs.jsx';
const CONSTANTS = 'src/constants/salesConstants.js';

describe('Credit Notes · List/Kanban toggle', () => {
  it('the credit-note list config opts into the shared Kanban board', () => {
    const config = read(CONFIG).split('export const creditNoteListConfig = {')[1].split('export const creditNoteViewConfig')[0];
    assert.match(config, /^ {2}kanban: true,$/m);
    // The toggle itself is rendered by the shared page for `config.kanban`.
    const page = read(PAGE);
    assert.match(page, /config\.kanban && \(\n\s+<div className="po-view-toggle" role="group" aria-label=\{`\$\{config\.title\} view`\}>/);
    assert.match(page, /className={`po-view-toggle-btn\$\{viewMode === 'kanban' \? ' active' : ''}`}/);
    // Both views are rendered from the SAME component instance, so search,
    // filters, KPIs and the Active/Archived/Deleted tab survive the switch.
    assert.match(page, /const \[viewMode, setViewMode\] = useState\('list'\);/);
  });

  it('columns are the module status values plus the Archived/Deleted buckets', () => {
    const page = read(PAGE);
    assert.match(page, /\.\.\.statusOptions\.map\(\(label\) => \(\{ label, key: String\(label\)\.toLowerCase\(\) \}\)\)/);
    assert.match(page, /subtab === 1 \? \[\{ label: 'Archived', key: 'archived' \}\] : \[\]/);
    assert.match(page, /subtab === 2 \? \[\{ label: 'Deleted', key: 'deleted' \}\] : \[\]/);
    // Cards come from the already-loaded list page rows — no second fetch.
    assert.match(
      page,
      /cards: pageRows\.filter\(\(row\) => String\(row\.status \|\| ''\)\.toLowerCase\(\) === col\.key\)/
    );
    const config = read(CONFIG).split('export const creditNoteListConfig = {')[1].split('export const creditNoteViewConfig')[0];
    assert.match(config, /statusOptions: CREDIT_NOTE_STATUSES|\{ key: 'status', label: 'Status', type: 'select', options: CREDIT_NOTE_STATUSES \}/);
    // The candidate statuses really are the module's own list.
    const constants = read(CONSTANTS);
    assert.match(constants, /export const CREDIT_NOTE_STATUSES = \[/);
  });

  it('move targets are limited to the statuses the credit-note backend persists', () => {
    const config = read(CONFIG);
    // Only draft / pending approval / approved / issued survive normalizeStatus.
    assert.match(
      config,
      /const CN_WRITABLE_STATUSES = \['draft', 'pending approval', 'approved', 'issued'\];/
    );
    assert.match(
      config,
      /const CN_KANBAN_MOVE_TARGETS = CREDIT_NOTE_STATUSES\.filter\(\(opt\) =>\n\s+CN_WRITABLE_STATUSES\.includes\(opt\.toLowerCase\(\)\)\n\);/
    );
    assert.match(config, /kanbanMoveTargets: CN_KANBAN_MOVE_TARGETS,/);
    // The board honours the narrowed list for drops, the ⋮ menu and its gate.
    const page = read(PAGE);
    assert.match(page, /const kanbanMoveTargets = config\.kanbanMoveTargets \|\| statusOptions;/);
    assert.match(page, /const canDropOnColumn = \(col\) =>\n\s+kanbanMoveTargets\.some\(/);
    assert.match(page, /\.\.\.kanbanMoveTargets\n\s+\.filter\(\(opt\) => String\(opt\)\.toLowerCase\(\) !== String\(row\.status \|\| ''\)\.toLowerCase\(\)\)/);
    assert.match(page, /\{kanbanMoveTargets\.length > 0 && \(/);
    // The move still goes through the existing status API, and the board
    // re-renders from the refetched server data (never local-only state).
    assert.match(page, /const res = await hook\.changeStatus\(row\.id, nextStatus\);/);
    // Credit Notes keep the writable statuses out of the move menu only —
    // every status still gets a column.
    assert.ok(!config.includes('kanban: false'));
  });

  it('cards carry the credit-note fields and the sales-order default is untouched', () => {
    const config = read(CONFIG);
    assert.match(config, /title: row\.cnNo \|\| `#\$\{row\.id\}`/);
    assert.match(config, /subtitle: row\.clientName \|\| '—'/);
    assert.match(config, /\['Source', row\.sourceRef \|\| '—'\]/);
    assert.match(config, /\['Date', formatDate\(row\.cnDate\)\]/);
    assert.match(config, /\['Amount', formatINR\(row\.grandTotal, row\.currency\)\]/);
    const page = read(PAGE);
    // Sales Orders — the original Kanban module — keeps its own card fields as
    // the default branch of the shared card resolver.
    assert.match(page, /\['PO Ref', row\.customerPo \|\| '—'\]/);
    assert.match(page, /\['Amount', formatINR\(row\.grandTotal, row\.currency\)\]/);
    assert.match(page, /\['SC Ref', row\.scRef \|\| '—'\]/);
    // A card is opened through the module's existing view route.
    assert.match(page, /onClick=\{\(\) => !isMoving && navigate\(config\.viewRoute\(row\)\)\}/);
    // Status badge + pending-approval badge are the shared ones.
    assert.match(page, /<SalesStatusBadge status=\{row\.status\} \/>/);
  });

  it('the board keeps its loading, empty and pagination states', () => {
    const page = read(PAGE);
    assert.match(page, /No records in this stage/);
    assert.match(page, /No \{config\.titlePlural \|\| config\.title\} found/);
    assert.match(page, /border-slate-200 border-t-\[#0B4A3D\] animate-spin/);
    assert.match(page, /<CprPagination\n\s+total=\{totalCount\}/);
  });
});
