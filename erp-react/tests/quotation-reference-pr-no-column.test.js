/**
 * tests/quotation-reference-pr-no-column.test.js
 * ------------------------------------------------------------------
 * Sales Execution → Quotations: the Reference PR No. column.
 *
 * The list had the column defined but hidden by default, so the table never
 * showed the quotation's real source PR reference (Quotation.referencePrNo)
 * even though the API already returned it. Covered here:
 *
 *   COLUMN    the column is part of the default layout, labelled
 *             "Reference PR No.", shown after the Client, rendered as '—' when
 *             the quotation has no source reference, and included in the
 *             CSV/Excel export (the exporters walk the visible columns)
 *   UPGRADE   a configuration stored while the column was hidden by default is
 *             refreshed once and stamped, so it can never fight the user's own
 *             show/hide choice afterwards
 *   BACKEND   the reference is a real persisted relation that the list response
 *             carries, and it is searchable and sortable server-side
 *
 * Run: node --test tests/quotation-reference-pr-no-column.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const CONFIG = 'src/config/salesPageConfigs.jsx';
const PAGE = 'src/pages/sales/QuotationListPage.jsx';
const ENTITY = 'erp-backend/src/main/java/com/vishatech/erp/entity/Quotation.java';
const RESPONSE = 'erp-backend/src/main/java/com/vishatech/erp/dto/QuotationResponse.java';
const SERVICE = 'erp-backend/src/main/java/com/vishatech/erp/service/QuotationService.java';
const API_TEST = 'erp-backend/src/test/java/com/vishatech/erp/security/SalesExecApiTest.java';

describe('Quotations list · Reference PR No. column', () => {
  it('is part of the default layout, shown and correctly labelled', () => {
    const config = read(CONFIG);
    assert.match(config, /export const REFERENCE_PR_NO_LABEL = 'Reference PR No\.'/);
    assert.match(config, /export const REFERENCE_PR_NO_LEGACY_LABEL = 'Reference PR No';/);
    assert.match(config, /export const REFERENCE_PR_NO_COLUMN = 'referencePrNo';/);
    assert.match(config, /key: REFERENCE_PR_NO_COLUMN,\s*\n\s*label: REFERENCE_PR_NO_LABEL,/);
    // Visible by default: no `hidden: true` on this column definition.
    const column = config.slice(config.indexOf('label: REFERENCE_PR_NO_LABEL'));
    const definition = column.slice(0, column.indexOf('\n    },'));
    assert.ok(!/hidden: true/.test(definition), 'the column must not default to hidden');
    assert.match(definition, /sortable: true/);
  });

  it('places it after Client, before Sales Person, and shows — without a reference', () => {
    const config = read(CONFIG);
    const order = ["key: 'clientName'", 'key: REFERENCE_PR_NO_COLUMN', "key: 'salesPerson'"]
      .map((needle) => config.indexOf(needle));
    assert.ok(order[0] > 0 && order[1] > order[0] && order[2] > order[1], 'column order changed');
    assert.match(config, /const ref = row\.referencePrNo \|\| row\.reference;/);
    assert.match(config, /if \(!ref\) return '\\u2014';/);
    // The origin badge distinguishes a CPR-sourced reference from a direct one.
    assert.match(config, /row\.referencePrSource === 'CPR' \|\| !!row\.cprId/);
  });

  it('is exported by the CSV/Excel exporters', () => {
    const page = read(PAGE);
    // Exporters iterate the visible columns minus checkbox/actions…
    assert.match(page, /const exportColumns = \(\) => visibleColumns\.filter/);
    // …and the reference cell resolves to the same value the table shows.
    assert.match(page, /case REFERENCE_PR_NO_COLUMN:[\s\S]{0,200}return row\[REFERENCE_PR_NO_COLUMN\] \|\| row\.reference \|\| '';/);
  });

  it('upgrades a configuration stored while the column was hidden, once', () => {
    const page = read(PAGE);
    assert.match(page, /const upgradedReferencePrNo = useRef\(false\);/);
    assert.match(page, /const needsReveal = Boolean\(column\.hidden\) && !column\.revealed;/);
    assert.match(page, /const needsLabel = column\.label === REFERENCE_PR_NO_LEGACY_LABEL && !column\.relabelled;/);
    assert.match(page, /hidden: needsReveal \? false : c\.hidden,/);
    assert.match(page, /label: needsLabel \? REFERENCE_PR_NO_LABEL : c\.label,/);
    // Stamped in the stored configuration, so a later user hide/show wins.
    assert.match(page, /revealed: c\.revealed \|\| needsReveal,/);
    assert.match(page, /relabelled: c\.relabelled \|\| needsLabel/);
  });

  it('reads a real persisted reference, searchable and sortable server-side', () => {
    // The relation the column displays.
    assert.match(read(ENTITY), /private String referencePrNo;/);
    assert.match(read(RESPONSE), /String referencePrNo,/);
    const service = read(SERVICE);
    assert.match(service, /case "clientName", "salesPerson", "quotationDate", "validUntil", "grandTotal", "status", "createdAt", "updatedAt", "referencePrNo" -> field;/);
    assert.match(service, /cb\.like\(cb\.lower\(cb\.toString\(root\.get\("referencePrNo"\)\)\), like\)/);
    // …and the API contract is pinned by an executed integration test.
    assert.match(read(API_TEST), /void quotationListExposesSearchableAndSortableReferencePrNo\(\)/);
  });
});
