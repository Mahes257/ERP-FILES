/**
 * tests/purchase-access-management.test.js
 * ------------------------------------------------------------------
 * Purchase · Access Management (Purchase Settings → Access Management).
 *
 *   CATALOG      the UI's area/action catalog is the backend enum — same areas,
 *                same actions per area — so a switch can never be rendered for a
 *                permission the server does not know (or vice versa), and the
 *                matrix only offers actions the Purchase controllers really have
 *   ENFORCEMENT  every Purchase API family is covered by the server-side
 *                interceptor, the Access Management endpoints stay ADMIN-only,
 *                and Purchase Settings honours settings.edit
 *   PERSISTENCE  permissions live only in the backend (the same app_settings
 *                store and audit log as the other modules, one row per scope);
 *                the browser never keeps them in localStorage/sessionStorage and
 *                never treats a failed load as "allow"
 *   UI           Access Management is an ADMIN-only section inside Purchase
 *                Settings, every Purchase route is behind the View gate, and the
 *                Purchase navigation hides what the user may not view
 *
 * Run: node --test tests/purchase-access-management.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PURCHASE_AREAS, ACTION_LABELS, allows, areaForPath } from '../src/purchase/access/catalog.js';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const BACKEND = 'erp-backend/src/main/java/com/vishatech/erp/';
const ACCESS_PKG = `${BACKEND}purchase/access/`;
const AREA_ENUM = `${ACCESS_PKG}PurchaseAccessArea.java`;
const SERVICE = `${ACCESS_PKG}PurchaseAccessService.java`;
const CONTROLLER = `${ACCESS_PKG}PurchaseAccessController.java`;
const INTERCEPTOR = `${ACCESS_PKG}PurchaseAccessInterceptor.java`;
const WEB_CONFIG = `${ACCESS_PKG}PurchaseAccessWebConfig.java`;
const POLICY = `${ACCESS_PKG}PurchaseAccessPolicy.java`;

/** Parse the area enum: key, label, and the actions listed for it. */
function parseBackendAreas() {
  const src = read(AREA_ENUM);
  const body = src.slice(src.indexOf('public enum PurchaseAccessArea'), src.indexOf('private final String key;'));
  const areas = [];
  const entry = /\n {4}([A-Z_]+)\("([^"]+)",\s*"([^"]+)",([\s\S]*?)\)[,;]\n/g;
  let match;
  while ((match = entry.exec(`${body}\n`)) !== null) {
    const actions = [...match[4].matchAll(/PurchaseAccessAction\.([A-Z_]+)/g)].map((m) => m[1].toLowerCase());
    areas.push({ code: match[1], key: match[2], label: match[3], actions });
  }
  return areas;
}

// ── the catalog ───────────────────────────────────────────────────────────

describe('Purchase access · the catalog is the backend enum', () => {
  it('declares every backend area, and only those', () => {
    const backend = parseBackendAreas().map((area) => area.key).sort();
    const frontend = PURCHASE_AREAS.map((area) => area.key).sort();
    assert.ok(backend.length >= 12, 'the backend enum must declare the real Purchase areas');
    assert.deepEqual(frontend, backend);
  });

  it('offers exactly the actions each area supports on the backend', () => {
    for (const area of parseBackendAreas()) {
      const ui = PURCHASE_AREAS.find((entry) => entry.key === area.key);
      assert.ok(ui, `${area.key} must exist in the UI catalog`);
      assert.deepEqual([...ui.actions].sort(), [...area.actions].sort(),
        `${area.key} actions must match the backend`);
    }
  });

  it('never offers an action the Purchase module does not have', () => {
    const byKey = Object.fromEntries(PURCHASE_AREAS.map((area) => [area.key, area.actions]));
    // Read-only aggregations and the shared document repository.
    assert.deepEqual(byKey.dashboard, ['view']);
    assert.deepEqual(byKey.workQueue, ['view']);
    assert.deepEqual(byKey.documents, ['view']);
    assert.deepEqual(byKey.reports, ['view', 'export', 'print']);
    assert.deepEqual(byKey.settings, ['view', 'edit']);
    // Nothing in Purchase imports records.
    for (const area of PURCHASE_AREAS) {
      assert.ok(!area.actions.includes('import'), `${area.key} must not offer Import`);
    }
    // Vendor Management and Adjustment Notes have no approval workflow.
    assert.ok(!byKey.vendors.includes('approve'));
    assert.ok(!byKey.adjustmentNotes.includes('award'));
    // The workflows that do exist are offered where they really happen.
    assert.ok(byKey.orders.includes('release'));
    assert.ok(byKey.orders.includes('acknowledge'));
    assert.ok(byKey.rfq.includes('award'));
    assert.ok(byKey.rfq.includes('evaluate'));
    assert.ok(byKey.invoices.includes('match'));
    assert.ok(byKey.invoices.includes('pay'));
    assert.ok(byKey.logistics.includes('receive'));
    assert.ok(byKey.requisition.includes('convert'));
    for (const area of PURCHASE_AREAS) {
      for (const action of area.actions) {
        assert.ok(ACTION_LABELS[action], `missing label for ${area.key}.${action}`);
      }
    }
  });

  it('maps each Purchase URL to its area by the longest prefix', () => {
    assert.equal(areaForPath('/purchase/dashboard'), 'dashboard');
    assert.equal(areaForPath('/purchase/work-queue'), 'workQueue');
    assert.equal(areaForPath('/purchase/requisition/12/edit'), 'requisition');
    assert.equal(areaForPath('/purchase/vendors/7'), 'vendors');
    assert.equal(areaForPath('/purchase/rfq/9'), 'rfq');
    // The follow-ups page is nested under /purchase/rfq but is its own area.
    assert.equal(areaForPath('/purchase/rfq/follow-ups/new'), 'followUps');
    // Workflow screens nested under /purchase/rfq are their own areas.
    assert.equal(areaForPath('/purchase/rfq/9'), 'rfq');
    assert.equal(areaForPath('/purchase/rfq/technical-evaluation'), 'rfqTechnicalEvaluation');
    assert.equal(areaForPath('/purchase/rfq/negotiation/9'), 'rfqNegotiation');
    assert.equal(areaForPath('/purchase/rfq/price-comparative-statement'), 'rfqPcs');
    assert.equal(areaForPath('/purchase/rfq/approval/2'), 'nfa');
    // Vendor submodules sit under /purchase/vendors but answer to their own area.
    assert.equal(areaForPath('/purchase/vendors/performance'), 'vendorPerformance');
    assert.equal(areaForPath('/purchase/vendors/reports'), 'vendorReports');
    assert.equal(areaForPath('/purchase/requisition/tech-spec'), 'prTechSpec');
    assert.equal(areaForPath('/purchase/orders/4'), 'orders');
    // Each Logistics submodule is protected by its own area, not the module's.
    assert.equal(areaForPath('/purchase/logistics'), 'logistics');
    assert.equal(areaForPath('/purchase/logistics/manufacturing'), 'packing');
    assert.equal(areaForPath('/purchase/logistics/shipment'), 'shipments');
    assert.equal(areaForPath('/purchase/logistics/grn/8'), 'grn');
    assert.equal(areaForPath('/purchase/logistics/quality'), 'inspections');
    assert.equal(areaForPath('/purchase/logistics/inventory'), 'inventory');
    assert.equal(areaForPath('/purchase/invoices/4'), 'invoices');
    assert.equal(areaForPath('/purchase/invoices/three-way-matching'), 'invoiceMatching');
    assert.equal(areaForPath('/purchase/invoices/vendor-payment'), 'payments');
    assert.equal(areaForPath('/purchase/payments/12/360'), 'payments');
    // Adjustment notes are nested under /purchase/invoices but are their own area.
    assert.equal(areaForPath('/purchase/invoices/notes'), 'adjustmentNotes');
    assert.equal(areaForPath('/purchase/documents'), 'documents');
    assert.equal(areaForPath('/purchase/reports/dashboard'), 'reports');
    assert.equal(areaForPath('/purchase/settings'), 'settings');
    assert.equal(areaForPath('/sales/dashboard'), null);
  });

  it('fails closed on a missing permission', () => {
    assert.equal(allows(null, 'orders', 'view'), false);
    assert.equal(allows({}, 'orders', 'view'), false);
    assert.equal(allows({ orders: {} }, 'orders', 'view'), false);
    assert.equal(allows({ orders: { view: true } }, 'orders', 'view'), true);
    assert.equal(allows({ orders: { view: true } }, 'orders', 'delete'), false);
  });
});

// ── backend enforcement ───────────────────────────────────────────────────

describe('Purchase access · the server enforces it', () => {
  it('mounts the interceptor on the Purchase API only', () => {
    const web = read(WEB_CONFIG);
    assert.match(web, /"\/api\/purchase", "\/api\/purchase\/\*\*"/);
    assert.match(web, /addInterceptor\(purchaseAccessInterceptor\)/);
  });

  it('refuses a denied request with a real 403 and excludes the management surface', () => {
    const interceptor = read(INTERCEPTOR);
    assert.match(interceptor, /ForbiddenException/);
    assert.match(interceptor, /accessService\.can\(requirement\)/);
    assert.match(read(POLICY), /path\.startsWith\("\/api\/purchase\/access\/"\)/);
  });

  it('keeps Access Management ADMIN-only', () => {
    const controller = read(CONTROLLER);
    const adminChecks = controller.match(/hasAuthority\('ROLE_ADMIN'\)/g) || [];
    // options, scope read, scope save, scope reset — four management endpoints.
    assert.ok(adminChecks.length >= 4, 'every management endpoint must be ADMIN-only');
    assert.match(controller, /@RequestMapping\("\/purchase\/access"\)/);
  });

  it('stores one row per scope under its own Purchase prefix', () => {
    const service = read(SERVICE);
    assert.match(service, /PURCHASE_ACCESS|purchase\.access|purchase-access/);
    assert.match(service, /appSettingRepository|AppSettingRepository/);
  });

  it('gates Purchase Settings writes on settings.edit in the UI', () => {
    const settings = read('src/purchase/pages/settings/Settings.jsx');
    assert.match(settings, /canPurchase\('settings', 'edit'\)/);
    assert.match(settings, /disabled=\{saving \|\| !canEditSettings\}/);
  });
});

// ── persistence and the client ────────────────────────────────────────────

describe('Purchase access · the browser keeps nothing', () => {
  it('reads permissions from the Purchase access API only', () => {
    const service = read('src/services/purchaseAccessService.js');
    assert.match(service, /'\/purchase\/access\/me'/);
    assert.match(service, /'\/purchase\/access\/options'/);
    for (const file of ['src/services/purchaseAccessService.js', 'src/purchase/access/usePurchaseAccess.js']) {
      const src = read(file);
      assert.ok(!/localStorage\.|sessionStorage\./.test(src), `${file} must not persist permissions`);
    }
  });

  it('never treats a failed load as an allow', () => {
    const hook = read('src/purchase/access/usePurchaseAccess.js');
    assert.match(hook, /status: 'error'/);
    assert.match(hook, /const permissions = payload\?\.permissions \|\| emptyPermissions\(\)/);
    const guard = read('src/purchase/access/PurchaseAccessGuard.jsx');
    assert.match(guard, /Navigate to="\/error\/403"/);
    assert.match(guard, /if \(!areaKey \|\| !can\(areaKey, requiredAction\)\)/);
  });
});

// ── UI ────────────────────────────────────────────────────────────────────

describe('Purchase access · the UI', () => {
  it('adds Access Management as an ADMIN-only section of Purchase Settings', () => {
    const settings = read('src/purchase/pages/settings/Settings.jsx');
    assert.match(settings, /key: 'access', label: 'Access Management'/);
    assert.match(settings, /adminOnly: true/);
    assert.match(settings, /SECTIONS\.filter\(\(sec\) => !sec\.adminOnly \|\| isAdmin\)/);
    assert.match(settings, /case 'access': return <AccessManagement \/>/);
    const panel = read('src/purchase/pages/settings/AccessManagement.jsx');
    assert.match(panel, /PURCHASE_AREAS\.map/);
    assert.match(panel, /saveScope|purchaseAccessService\.saveScope/);
    assert.match(panel, /resetScope|purchaseAccessService\.resetScope/);
  });

  it('puts every Purchase route behind the View gate', () => {
    const routes = read('src/purchase/routes/purchaseRoutes.jsx');
    const elements = [...routes.matchAll(/<Route path="([^"]+)" element=\{([^\n]+)\}/g)]
      .map((m) => ({ path: m[1], element: m[2] }));
    assert.ok(elements.length >= 60, 'the Purchase route table must be intact');
    for (const route of elements) {
      if (/<Navigate/.test(route.element)) continue;
      assert.match(route.element, /<Guard area="/, `/purchase/${route.path} must be behind a Purchase guard`);
    }
    // The create and edit pages need their own action, not just View.
    assert.match(routes, /path="orders\/new" element=\{<Guard area="orders" action="create">/);
    assert.match(routes, /path="orders\/:id\/edit" element=\{<Guard area="orders" action="edit">/);
  });

  it('hides a Purchase navigation entry whose area is not viewable', () => {
    const nav = read('src/components/Layout/SalesNav.jsx');
    assert.match(nav, /PURCHASE_NAV_AREAS/);
    assert.match(nav, /purchaseAllows\(purchasePermissions, area, 'view'\)/);
    assert.match(nav, /'purchase-settings': 'settings'/);
  });
});
