/**
 * tests/cpo-eactions-default-and-picker.test.js
 * ------------------------------------------------------------------
 * Customer Purchase Orders: the sub-tab it opens on, the Customer Purchase
 * Order field of the New E-Action form, and the manual CPO reference.
 *
 *   DEFAULT   the CPO branch opens on E-Actions (not the CPO List table) and
 *             keeps its own sub-tabs (E-Actions / CPO List / Production
 *             Tracker), with E-Actions as the param-less URL state so a
 *             refresh / deep link keeps the same tab. QC and Packing List are
 *             top-level Sales Execution modules, NOT CPO sub-tabs.
 *   PICKER    the New E-Action form's CPO field is a searchable, typeable
 *             combobox fed by the EXISTING options service: it filters on CPO
 *             number / customer / order date / id, supports keyboard selection,
 *             and commits the CPO's real record id — never the typed text
 *   MANUAL    a CPO reference that is not one of our CPO records is accepted
 *             and saved as free text on the row (case 2), needs no CPO record
 *             (nothing is created for it), survives a refresh (case 3) and can
 *             still be edited and deleted — the linked CPO path is untouched
 *   BACKEND   the row can carry either a real CPO link or the typed reference:
 *             nullable relationship, free-text column, own-id endpoints, and
 *             reads (list / filters / counts) that include CPO-less rows
 *
 * Run: node --test tests/cpo-eactions-default-and-picker.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const HUB = 'src/pages/sales/CustomerPurchaseOrdersHub.jsx';
const EXEC = 'src/pages/sales/SalesExecHub.jsx';
const FORM = 'src/pages/sales/EActionFormPage.jsx';
const LIST = 'src/pages/sales/CpoEActions.jsx';
const VIEW = 'src/pages/sales/EActionViewPage.jsx';
const SERVICE = 'src/services/salesOrderEActionService.js';
const BACKEND = 'erp-backend/src/main/java/com/vishatech/erp';
const MIGRATION = 'erp-backend/docs/sales_execution_migration.sql';

describe('Customer Purchase Orders · E-Actions opens first', () => {
  it('keeps E-Actions first and no longer hosts QC / Packing List', () => {
    const hub = read(HUB);
    const keys = [...hub.matchAll(/\{ key: '([a-z-]+)', label: '([^']+)'/g)].map((m) => m[1]);
    assert.deepEqual(keys.slice(0, 3), ['e-actions', 'cpo-list', 'production-tracker']);
    assert.match(hub, /const DEFAULT_SUB_TAB = 'e-actions';/);
    // No QC / Packing List sub-tab (and no duplicate button) is left here.
    assert.ok(!/key: 'qc'/.test(hub), 'QC must not be a CPO sub-tab any more');
    assert.ok(!/key: 'packing-list'/.test(hub), 'Packing List must not be a CPO sub-tab any more');
    assert.ok(!/proforma-invoices\/new\?docType=packing-list/.test(hub), 'the sub-hub no longer owns the Packing List New action');
  });

  it('declares QC and Packing List as top-level tabs right after the CPO branch', () => {
    const exec = read(EXEC);
    const order = [...exec.matchAll(/\{ key: '([a-zA-Z]+)', label: '([^']+)', icon: \w+, component: \w+ \}/g)].map((m) => m[1]);
    assert.deepEqual(order, [
      'quotations',
      'salesContracts',
      'customerPO',
      'qc',
      'packingList',
      'proformaInvoices',
      'deliveryChallans',
      'invoices',
      'creditNotes',
      'paymentReceipts'
    ]);
    // They reuse the EXISTING branch pages and standalone routes.
    assert.match(exec, /import \{ QcPage, PackingList \} from '\.\/SalesOrders';/);
    assert.match(exec, /qc: '\/sales-orders\/qc'/);
    assert.match(exec, /packingList: '\/sales-orders\/packing-list'/);
    // A saved CPO-branch link (?tab=customerPO&cpoTab=qc|packing-list) still
    // reaches the module its own tab now owns.
    assert.match(exec, /const LEGACY_CPO_MODULE_TABS = \{ qc: 'qc', 'packing-list': 'packingList' \};/);
  });

  it('defaults to E-Actions when the URL carries no sub-tab', () => {
    const hub = read(HUB);
    assert.match(hub, /initialTab = DEFAULT_SUB_TAB/);
    assert.match(hub, /const fallbackTab = isTabKey\(initialTab\) \? initialTab : DEFAULT_SUB_TAB;/);
    assert.match(hub, /useState\(\(\) => \(isTabKey\(requestedTab\) \? requestedTab : fallbackTab\)\)/);
    // The standalone /sales-orders route mounts the hub without a prop, so it
    // opens on the same sub-tab as the Sales Execution tab click.
    assert.match(
      read('src/App.jsx'),
      /path="\/sales-orders" element=\{<SalesAccessGuard area="cpo"><CustomerPurchaseOrdersHub \/><\/SalesAccessGuard>\}/
    );
  });

  it('keeps the cpoTab URL contract: default is param-less, the rest are spelled out', () => {
    const hub = read(HUB);
    assert.match(hub, /const SUB_TAB_PARAM = 'cpoTab';/);
    assert.match(hub, /if \(key === DEFAULT_SUB_TAB\) next\.delete\(SUB_TAB_PARAM\);\s*\n\s*else next\.set\(SUB_TAB_PARAM, key\);/);
    // CPO List is still reachable and now takes the explicit param.
    assert.match(hub, /'cpo-list': '\/sales-orders\/cpo-list'/);
    // The parent hub reads the same default, so its header action matches the
    // sub-tab actually rendered.
    assert.match(read(EXEC), /const cpoSubTab = searchParams\.get\('cpoTab'\) \|\| 'e-actions';/);
    assert.match(read(EXEC), /customerPO: cpoSubTab === 'cpo-list' \? \{ label: 'CPO', to: '\/sales-orders\/new' \} : null/);
  });
});

describe('New E-Action · Customer Purchase Order field', () => {
  it('is a searchable combobox instead of the old plain select', () => {
    const form = read(FORM);
    assert.ok(!/<option value="">Select a CPO<\/option>/.test(form), 'the plain CPO <select> must be replaced');
    assert.ok(!/cpoNo\(c\.cpoNo\)/.test(form), 'the stale option fields must not come back');
    assert.match(form, /function CpoSearchSelect\(\{/);
    assert.match(form, /<CpoSearchSelect\b/);
    assert.match(form, /role="combobox"/);
    assert.match(form, /role="listbox"/);
    assert.match(form, /role="option"/);
    assert.match(form, /aria-activedescendant=/);
  });

  it('filters by CPO number, customer, order date and record id as you type', () => {
    const form = read(FORM);
    assert.match(form, /function cpoSearchText\(cpo\) \{/);
    assert.match(form, /return \[cpoDisplayNo\(cpo\), cpoCustomer\(cpo\), cpo\?\.orderDate, cpo\?\.id\]/);
    assert.match(form, /return cpos\.filter\(\(c\) => cpoSearchText\(c\)\.includes\(q\)\);/);
    assert.match(form, /onChange=\{\(event\) => \{\s*\n\s*setOpen\(true\);\s*\n\s*setQuery\(event\.target\.value\);/);
  });

  it('reads the real option payload and shows CPO number plus customer', () => {
    const form = read(FORM);
    // SalesOrderOptionResponse: { id, soNo, clientId, clientName, orderDate, itemCount }
    assert.match(form, /cpoNo\(cpo\?\.soNo \?\? cpo\?\.cpoNo \?\? ''\)/);
    assert.match(form, /return cpo\?\.clientName \|\| cpo\?\.customer \|\| '';/);
    assert.match(form, /\{cpoDisplayNo\(cpo\)\}/);
    assert.match(form, /\{cpoCustomer\(cpo\) \|\| 'No customer on record'\}/);
    // …from the SAME existing service call the page already used.
    assert.match(form, /salesOrderEActionService\s*\n?\s*\.options\(\)/);
    assert.match(read(SERVICE), /api\.get\(`\$\{base\}\/options`/);
  });

  it('commits the CPO record id, never the typed display text', () => {
    const form = read(FORM);
    const selectBody = form.slice(form.indexOf('const select = (cpo) => {'), form.indexOf('const onKeyDown = (event) => {'));
    assert.match(selectBody, /if \(!cpo \|\| cpo\.id == null\) return;/);
    assert.match(selectBody, /onChange\(Number\(cpo\.id\)\);/);
    // The input DISPLAYS the chosen CPO's label (or the typed manual reference);
    // the form state holds the id.
    assert.match(form, /value=\{open \? query : selected \? cpoOptionLabel\(selected\) : reference\}/);
    assert.match(form, /const handleCpoChange = \(salesOrderId\) => \{\s*\n\s*setForm\(\(prev\) => \(\{ \.\.\.prev, salesOrderId, cpoReference: '' \}\)\);/);
  });

  it('supports keyboard search and selection', () => {
    const form = read(FORM);
    assert.match(form, /event\.key === 'ArrowDown'/);
    assert.match(form, /event\.key === 'ArrowUp'/);
    assert.match(form, /event\.key === 'Enter'/);
    assert.match(form, /event\.key === 'Escape'/);
    assert.match(form, /event\.key === 'Tab'/);
    assert.match(form, /if \(filtered\[highlight\]\) select\(filtered\[highlight\]\);/);
  });
});

describe('New E-Action · saving without an existing CPO', () => {
  it('keeps a typed CPO reference instead of rejecting it', () => {
    const form = read(FORM);
    // Unmatched text becomes the row's manual CPO reference…
    assert.match(form, /if \(keepTypedText && noMatch\) onManualReference\?\.\(typed\);/);
    assert.match(form, /const handleManualReference = \(text\) => \{\s*\n\s*const value = String\(text \|\| ''\)\.trim\(\);\s*\n\s*setForm\(\(prev\) => \(\{ \.\.\.prev, salesOrderId: '', cpoReference: value \}\)\);/);
    assert.match(form, /cpoReference: row\.cpoReference \|\| ''/);
    assert.match(form, /reference={manualCpoReference}/);
    assert.match(form, /onManualReference={handleManualReference}/);
    // …and the field says so in plain language (not an error).
    assert.match(form, /is not in the CPO list — it will be saved as this E-Action's CPO reference\./);
    assert.match(form, /is not in the CPO list — press Enter \(or click away\) to save it as the CPO reference\./);
    // The old blocking message must be gone.
    assert.ok(!/does not match any existing Customer Purchase Order/.test(form));
  });

  it('accepts either address and only rejects "neither"', () => {
    const form = read(FORM);
    assert.match(form, /const manualCpoReference = String\(form\.cpoReference \|\| ''\)\.trim\(\);/);
    assert.match(form, /if \(!form\.salesOrderId && !manualCpoReference\) \{/);
    assert.match(form, /'Select an existing Customer Purchase Order, or type the CPO reference this E-Action belongs to\.'/);
    // The reference is only sent as the row's address when there is no CPO id.
    assert.match(form, /cpoReference: form\.salesOrderId \? '' : manualCpoReference,/);
  });

  it('saves through the CPO-scoped endpoint when linked and the own-id endpoint otherwise', () => {
    const form = read(FORM);
    assert.match(form, /const res = form\.salesOrderId\s*\n\s*\? await salesOrderEActionService\.create\(form\.salesOrderId, payload\(\)\)\s*\n\s*: await salesOrderEActionService\.createStandalone\(payload\(\)\);/);
    assert.match(form, /if \(form\.salesOrderId\) await salesOrderEActionService\.update\(form\.salesOrderId, id, payload\(\)\);\s*\n\s*else await salesOrderEActionService\.updateStandalone\(id, payload\(\)\);/);
    // Save & New keeps the same CPO address (record or reference).
    assert.match(form, /salesOrderId: form\.salesOrderId,\s*\n\s*cpoReference: form\.cpoReference,/);
    // No CPO record is ever created from the form, and no new dependency appears.
    assert.ok(!/createCpo|createSalesOrder|sales-orders\/new/.test(form));
    assert.deepEqual(
      [...form.matchAll(/from '\.\.\/\.\.\/services\/([^']+)'/g)].map((m) => m[1]),
      ['salesOrderEActionService']
    );
  });

  it('never creates a CPO: the standalone calls post to the E-Actions endpoints only', () => {
    const service = read(SERVICE);
    assert.match(service, /async createStandalone\(payload\) \{\s*\n\s*return request\(async \(\) => \{\s*\n\s*const \{ data \} = await api\.post\(base, payload\);/);
    assert.match(service, /async updateStandalone\(actionId, payload\) \{\s*\n\s*return request\(async \(\) => \{\s*\n\s*const \{ data \} = await api\.put\(`\$\{base\}\/\$\{actionId\}`, payload\);/);
    assert.match(service, /async removeStandalone\(actionId\) \{\s*\n\s*return request\(async \(\) => \{\s*\n\s*const \{ data \} = await api\.delete\(`\$\{base\}\/\$\{actionId\}`\);/);
    assert.ok(!/api\.post\('\/sales-orders'/.test(service), 'the E-Action service must not create CPOs');
  });

  it('shows the manual reference in the list and routes its edit / delete by row id', () => {
    const list = read(LIST);
    // Plain text (nothing to open) when there is no CPO record behind the row.
    assert.match(list, /if \(!row\.salesOrderId\) \{\s*\n\s*const reference = row\.cpoReference \|\| '';/);
    // Delete through the endpoint that can address the row.
    assert.match(list, /const removeEAction = \(row\) =>\s*\n\s*row\.salesOrderId\s*\n\s*\? salesOrderEActionService\.remove\(row\.salesOrderId, row\.id\)\s*\n\s*: salesOrderEActionService\.removeStandalone\(row\.id\);/);
    const view = read(VIEW);
    assert.match(view, /: salesOrderEActionService\.updateStandalone\(action\.id, payload\);/);
    assert.match(view, /: salesOrderEActionService\.removeStandalone\(action\.id\)\);/);
    assert.match(view, /row\('Customer Purchase Order', action\.cpoReference\);/);
  });

  it('renders a row with no CPO record without crashing on the first render', () => {
    const view = read(VIEW);
    // The linked-documents memo runs on EVERY render — including the first one,
    // where the row is still loading — so it must not dereference `action`
    // before the loading / not-found early returns get a chance to render.
    assert.match(view, /if \(!action\) return docs;/);
    assert.ok(!/\[order, action\.cpoReference, navigate\]/.test(view), 'the deps array must not read action.cpoReference');
    assert.match(view, /\}, \[action, order, navigate\]\);/);
    // The typed reference stands in for the CPO number everywhere the row is shown.
    assert.match(view, /action\.cpoReference \|\| '—'/);
    assert.ok(!/does not match any existing Customer Purchase Order/.test(read(FORM)));
  });
});

describe('E-Action backend · an existing CPO is optional', () => {
  it('lets the row carry either a real CPO link or a typed reference', () => {
    const entity = read(`${BACKEND}/entity/SalesOrderEAction.java`);
    assert.match(entity, /@ManyToOne\(fetch = FetchType\.LAZY, optional = true\)\s*\n\s*@JoinColumn\(name = "sales_order_id", nullable = true\)\s*\n\s*private SalesOrder salesOrder;/);
    assert.match(entity, /@Column\(name = "cpo_reference", length = 255\)\s*\n\s*private String cpoReference;/);
    assert.match(entity, /public String getCpoReference\(\) \{/);
  });

  it('carries the two addresses in the request and the reference in the response', () => {
    const request = read(`${BACKEND}/dto/SalesOrderEActionRequest.java`);
    assert.match(request, /Map<String, String> customFields,\s*\n\s*Long salesOrderId,\s*\n\s*String cpoReference\s*\n\)/);
    const response = read(`${BACKEND}/dto/SalesOrderEActionListResponse.java`);
    assert.match(response, /String createdAt,\s*\n\s*\/\*\*[\s\S]*?\*\/\s*\n\s*String cpoReference\s*\n\)/);
    assert.match(read(`${BACKEND}/service/SalesOrderService.java`), /action\.getCreatedAt\(\) == null \? null : action\.getCreatedAt\(\)\.toString\(\),\s*\n\s*action\.getCpoReference\(\)\);/);
  });

  it('persists a reference (and rejects a row with neither address)', () => {
    const service = read(`${BACKEND}/service/SalesOrderService.java`);
    assert.match(service, /private void linkEAction\(SalesOrderEAction action, Long salesOrderId, String cpoReference\) \{/);
    assert.match(service, /if \(hasText\(cpoReference\)\) \{\s*\n\s*action\.setSalesOrder\(null\);\s*\n\s*action\.setCpoReference\(cpoReference\.trim\(\)\);/);
    assert.match(service, /"Select an existing Customer Purchase Order or enter the CPO reference this E-Action belongs to\."/);
    // The typed reference links the action to NO CPO — nothing is created.
    assert.ok(!/salesOrderRepository\.save\(new SalesOrder/.test(service));
  });

  it('exposes own-id create / update / delete endpoints for CPO-less rows', () => {
    const controller = read(`${BACKEND}/controller/SalesOrderController.java`);
    assert.match(controller, /@PostMapping\("\/e-actions"\)[\s\S]{0,400}createEActionStandalone\(/);
    assert.match(controller, /@PutMapping\("\/e-actions\/\{actionId\}"\)[\s\S]{0,300}updateEActionStandalone\(/);
    assert.match(controller, /@DeleteMapping\("\/e-actions\/\{actionId\}"\)[\s\S]{0,300}deleteEActionStandalone\(/);
    // Each keeps the authority the linked endpoint already required.
    const standaloneBlock = controller.slice(controller.indexOf('createEActionStandalone('));
    assert.match(standaloneBlock, /@PreAuthorize\("hasAuthority\('SALES_CREATE'\)"\)/);
    const service = read(`${BACKEND}/service/SalesOrderService.java`);
    assert.match(service, /public void deleteEAction\(Long actionId\) \{/);
    assert.match(service, /public SalesOrderEActionListResponse updateEAction\(Long actionId, SalesOrderEActionRequest request\) \{/);
  });

  it('lists, filters and counts CPO-less rows too (LEFT join, reference searchable)', () => {
    const repo = read(`${BACKEND}/repository/SalesOrderEActionRepository.java`);
    // Every query joins the order OUTER (4 of them), never inner — an inner
    // join would silently hide the rows that have no CPO.
    assert.equal((repo.match(/(?<!LEFT )JOIN a\.salesOrder o/g) || []).length, 0);
    assert.match(repo, /LEFT JOIN a\.salesOrder o/);
    assert.match(repo, /WHERE \(o IS NULL OR \(o\.status <> 'deleted' AND o\.latestRevision = true\)\)/);
    assert.match(repo, /LOWER\(COALESCE\(a\.cpoReference, ''\)\) LIKE LOWER\(CONCAT\('%', :search, '%'\)\)/);
    assert.equal((repo.match(/LEFT JOIN a\.salesOrder o/g) || []).length, 4);
  });

  it('ships the column and the nullable relationship as a migration', () => {
    const migration = read(MIGRATION);
    assert.match(migration, /ALTER TABLE sales_order_e_actions\s*\n\s*MODIFY COLUMN sales_order_id BIGINT NULL,\s*\n\s*ADD COLUMN cpo_reference VARCHAR\(255\) NULL AFTER sales_order_id;/);
    assert.match(migration, /No existing row is\s*\n--\s+touched/);
  });
});
