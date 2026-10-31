/**
 * tests/production-access-management.test.js
 * ------------------------------------------------------------------
 * Production · Access Management (Production Settings → Access Management).
 *
 *   CATALOG      the UI's area/action catalog IS the backend enum — same areas,
 *                same actions per area — so a switch can never be rendered for a
 *                permission the server does not know (or vice versa), and the
 *                matrix only offers actions the Production pages really have
 *   ENFORCEMENT  every Production API family is registered on the server-side
 *                interceptor, the Access Management endpoints stay ADMIN-only,
 *                and Documents / audit / the Sales tracker are left to their
 *                existing authorities
 *   PERSISTENCE  permissions live only in the backend (the same app_settings
 *                store and audit log as Marketing, one row per scope) and an
 *                unreadable configuration fails closed
 *   UI           Access Management is a section inside Production Settings, every
 *                Production route is behind the View gate, the navigation hides
 *                what the user may not view, and the settings write controls
 *                honour settings.create / settings.edit / settings.delete
 *
 * Run: node --test tests/production-access-management.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PRODUCTION_AREAS, ACTION_LABELS, allows, emptyPermissions, areaForPath, canViewProduction } from '../src/production/access/catalog.js';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const BACKEND = 'erp-backend/src/main/java/com/vishatech/erp/';
const ACCESS_PKG = `${BACKEND}production/access/`;
const AREA_ENUM = `${ACCESS_PKG}ProductionAccessArea.java`;
const SERVICE = `${ACCESS_PKG}ProductionAccessService.java`;
const CONTROLLER = `${ACCESS_PKG}ProductionAccessController.java`;
const INTERCEPTOR = `${ACCESS_PKG}ProductionAccessInterceptor.java`;
const WEB_CONFIG = `${ACCESS_PKG}ProductionAccessWebConfig.java`;
const POLICY = `${ACCESS_PKG}ProductionAccessPolicy.java`;

/** Parse the area enum: code, key, label, and the actions listed for it. */
function parseBackendAreas() {
  const src = read(AREA_ENUM);
  const body = src.slice(src.indexOf('public enum ProductionAccessArea'), src.indexOf('private final String key;'));
  const areas = [];
  // The Java sources use CRLF, so the anchors tolerate either ending.
  const entry = /\r?\n {4}([A-Z_]+)\("([^"]+)",\s*"([^"]+)",([\s\S]*?)\)[,;]\r?\n/g;
  let match;
  while ((match = entry.exec(`${body}\n`)) !== null) {
    const actions = [...match[4].matchAll(/ProductionAccessAction\.([A-Z_]+)/g)].map((m) => m[1].toLowerCase());
    areas.push({ code: match[1], key: match[2], label: match[3], actions });
  }
  return areas;
}

// ── the catalog ───────────────────────────────────────────────────────────

describe('Production access · the catalog is the backend enum', () => {
  it('declares every backend area, and only those', () => {
    const backend = parseBackendAreas().map((area) => area.key).sort();
    const frontend = PRODUCTION_AREAS.map((area) => area.key).sort();
    assert.ok(backend.length >= 17, 'the backend enum must declare the real Production areas');
    assert.deepEqual(frontend, backend);
  });

  it('offers exactly the actions each area supports on the backend', () => {
    for (const area of parseBackendAreas()) {
      const ui = PRODUCTION_AREAS.find((entry) => entry.key === area.key);
      assert.ok(ui, `${area.key} must exist in the UI catalog`);
      assert.deepEqual([...ui.actions].sort(), [...area.actions].sort(),
        `${area.key} actions must match the backend`);
    }
  });

  it('never offers an action a Production page does not have', () => {
    const byKey = Object.fromEntries(PRODUCTION_AREAS.map((area) => [area.key, area.actions]));
    assert.deepEqual(byKey.dashboard, ['view']);
    assert.deepEqual(byKey.documents, ['view']);
    assert.deepEqual(byKey.reports, ['view', 'export', 'print']);
    assert.deepEqual(byKey.settings, ['view', 'create', 'edit', 'delete']);
    // Technical Verification has no update endpoint — so no Edit switch.
    assert.ok(!byKey.technicalVerification.includes('edit'));
    // Packing and Dispatch have no approval or status transition.
    assert.ok(!byKey.packing.includes('approve'));
    assert.ok(!byKey.dispatch.includes('approve'));
    // Quality flags pass/fail/hold, not approve.
    assert.ok(byKey.quality.includes('pass') && byKey.quality.includes('fail'));
    assert.ok(!byKey.quality.includes('approve'));
    // Only the work-order area releases a document.
    assert.ok(byKey.orders.includes('release'));
    // Every rendered switch has a human label.
    for (const area of PRODUCTION_AREAS) {
      for (const action of area.actions) {
        assert.ok(ACTION_LABELS[action], `missing label for ${area.key}.${action}`);
      }
    }
  });

  it('fails closed: an empty matrix grants nothing', () => {
    const permissions = emptyPermissions();
    for (const area of PRODUCTION_AREAS) {
      for (const action of area.actions) {
        assert.equal(allows(permissions, area.key, action), false);
      }
    }
    assert.equal(allows({}, 'orders', 'view'), false);
    assert.equal(canViewProduction(permissions), false);
  });

  it('maps a path to the same area the route guard uses', () => {
    assert.equal(areaForPath('/production/orders/7'), 'orders');
    assert.equal(areaForPath('/production/machine-shop/new'), 'machineShop');
    assert.equal(areaForPath('/production/reports/delay-analysis'), 'reports');
    assert.equal(areaForPath('/production/settings/access'), 'settings');
  });
});

// ── backend enforcement ───────────────────────────────────────────────────

describe('Production access · the backend enforces it', () => {
  it('registers every Production API family on the interceptor', () => {
    const webConfig = read(WEB_CONFIG);
    for (const path of [
      '/production-orders', '/technical-verifications', '/drawings', '/models', '/castings',
      '/fabrications', '/machine-shop', '/assemblies', '/quality-inspections', '/packing',
      '/dispatch', '/acknowledgements', '/production-entries', '/production/settings'
    ]) {
      assert.ok(webConfig.includes(`"${path}"`), `${path} must be intercepted`);
    }
    // The shared document repository is only included in its bare form — its
    // writes stay on the pre-existing DOCUMENT_* authorities.
    assert.ok(webConfig.includes('"/documents"'));
    assert.ok(!webConfig.includes('"/documents/**"'));
  });

  it('maps each controller root to an area and never owns the Sales tracker', () => {
    const policy = read(POLICY);
    for (const [path, area] of [
      ['/production-orders', 'ORDERS'], ['/technical-verifications', 'TECHNICAL_VERIFICATION'],
      ['/drawings', 'DRAWINGS'], ['/models', 'MODELS'], ['/castings', 'CASTING'],
      ['/fabrications', 'FABRICATION'], ['/machine-shop', 'MACHINE_SHOP'],
      ['/assemblies', 'ASSEMBLY'], ['/quality-inspections', 'QUALITY'], ['/packing', 'PACKING'],
      ['/dispatch', 'DISPATCH'], ['/production-entries', 'ENTRY'], ['/production/settings', 'SETTINGS']
    ]) {
      assert.ok(policy.includes(`startsWith("${path}")`), `${path} must resolve to an area`);
      assert.ok(policy.includes(`ProductionAccessArea.${area}`), `${area} must be resolved`);
    }
    // The Sales tracker is the Sales-side page's data source — the policy must
    // not register it (the javadoc explains why, so look at the path list).
    const pathList = read(WEB_CONFIG).slice(read(WEB_CONFIG).indexOf('PRODUCTION_PATHS = {'),
      read(WEB_CONFIG).indexOf('};', read(WEB_CONFIG).indexOf('PRODUCTION_PATHS = {')));
    assert.ok(!pathList.includes('/production-trackers'), 'the Sales tracker must stay outside the policy');
  });

  it('keeps Access Management configuration ADMIN-only', () => {
    const controller = read(CONTROLLER);
    const gated = controller.match(/@PreAuthorize\("hasAuthority\('ROLE_ADMIN'\)"\)/g) || [];
    assert.ok(gated.length >= 4, 'options, scope read, save and reset must be ADMIN-only');
    assert.ok(controller.includes('@RequestMapping("/production/access")'));
  });

  it('fails closed on an unreadable configuration', () => {
    const service = read(SERVICE);
    assert.ok(service.includes('denyAll()'), 'an unreadable configuration must deny everything');
    assert.ok(service.includes('readScopeStrict'), 'the strict reader must exist');
  });

  it('persists to app_settings with an audit trail, like Marketing', () => {
    const service = read(SERVICE);
    assert.ok(service.includes('"production_access."'));
    assert.ok(service.includes('appSettingRepository.upsert'));
    assert.ok(service.includes('new SettingsAuditLog('));
  });

  it('derives the defaults from the existing role permissions', () => {
    const policy = read(POLICY);
    assert.ok(policy.includes('RolePermissions.permissionsOf(role)'));
    assert.ok(policy.includes('defaultAllow'));
  });
});

// ── frontend enforcement ──────────────────────────────────────────────────

describe('Production access · the UI enforces it', () => {
  const routes = read('src/production/routes/productionRoutes.jsx');

  it('wraps every Production route in the View gate', () => {
    assert.ok(routes.includes("guard('orders', 'view'"));
    assert.ok(routes.includes("guard('quality', 'create'"));
    assert.ok(routes.includes("guard('settings', 'view'"));
    assert.ok(routes.includes("path=\"access\""), 'Access Management is a section inside settings');
    // No bare element may render a Production page without a guard.
    const unguarded = [...routes.matchAll(/<Route[^>]*element=\{<(?![A-Za-z]*Guard)([A-Za-z]+)\s*\/>\}/g)]
      .map((m) => m[1])
      // PreviewRoute renders ProductionAccessGuard itself, per module.
      .filter((component) => !['Routes', 'Route', 'ProductionLayout', 'ErrorPage', 'PreviewRoute'].includes(component));
    assert.deepEqual(unguarded, []);
  });

  it('hides what the user may not view in the Production navigation', () => {
    const nav = read('src/components/Layout/SalesNav.jsx');
    assert.ok(nav.includes('useProductionAccess'));
    assert.ok(nav.includes('PRODUCTION_NAV_AREAS'));
    assert.ok(nav.includes("productionAllows(productionPermissions, area, 'view')"));
  });

  it('gates the Production Settings master-data controls', () => {
    const managers = [
      'MachineManager', 'WorkCenterManager', 'StatusMasterManager', 'UserRoleManager'
    ].map((name) => read(`src/production/components/production/settings/${name}.jsx`));
    for (const src of managers) {
      assert.ok(src.includes("can('settings', 'create')") || src.includes('canCreateSettings'));
      assert.ok(src.includes('canEditSettings') && src.includes('canDeleteSettings'));
    }
    const parameters = read('src/production/components/production/settings/ProductionParameters.jsx');
    assert.ok(parameters.includes("can('settings', 'edit')"));
  });

  it('opens Access Management as a section of Production Settings', () => {
    const shell = read('src/production/components/production/settings/ProductionSettingsShell.jsx');
    assert.ok(shell.includes("path: '/production/settings/access'"));
    assert.ok(shell.includes('Access Management'));
    // Users & Roles master data stays a separate section.
    assert.ok(shell.includes("path: '/production/settings/users-roles'"));
  });
});
