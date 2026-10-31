/**
 * tests/sales-access-management.test.js
 * ------------------------------------------------------------------
 * Sales · Access Management (Sales Settings → Access Management).
 *
 *   CATALOG      the UI's area/action catalog is the backend enum — same areas,
 *                same actions per area — so a switch can never be rendered for a
 *                permission the server does not know (or vice versa), and the
 *                matrix only offers actions the Sales controllers really have
 *   ENFORCEMENT  every Sales API family is covered by the server-side
 *                interceptor, the Access Management endpoints stay ADMIN-only,
 *                and the Sales Settings write honours settings.edit
 *   PERSISTENCE  permissions live only in the backend (the same app_settings
 *                store and audit log as Marketing, one row per scope); the
 *                browser never keeps them in localStorage/sessionStorage and
 *                never treats a failed load as "allow"
 *   UI           Access Management is a section inside Sales Settings, is
 *                ADMIN-only, every Sales route is behind the View gate, and the
 *                Sales navigation hides what the user may not view
 *
 * Run: node --test tests/sales-access-management.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { SALES_AREAS, SALES_MODULES, ACTION_LABELS, canViewModule, allows } from '../src/sales/access/catalog.js';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const BACKEND = 'erp-backend/src/main/java/com/vishatech/erp/';
const ACCESS_PKG = `${BACKEND}sales/access/`;
const AREA_ENUM = `${ACCESS_PKG}SalesAccessArea.java`;
const SERVICE = `${ACCESS_PKG}SalesAccessService.java`;
const CONTROLLER = `${ACCESS_PKG}SalesAccessController.java`;
const INTERCEPTOR = `${ACCESS_PKG}SalesAccessInterceptor.java`;
const WEB_CONFIG = `${ACCESS_PKG}SalesAccessWebConfig.java`;
const POLICY = `${ACCESS_PKG}SalesAccessPolicy.java`;
const SETTINGS_CONTROLLER = `${BACKEND}controller/SalesSettingsController.java`;

/** Parse the area enum: code, key, label, and the actions listed for it. */
function parseBackendAreas() {
  const src = read(AREA_ENUM);
  const body = src.slice(src.indexOf('public enum SalesAccessArea'), src.indexOf('private final String key;'));
  const areas = [];
  const entry = /\n {4}([A-Z_]+)\("([^"]+)",\s*"([^"]+)",([\s\S]*?)\)[,;]\n/g;
  let match;
  while ((match = entry.exec(`${body}\n`)) !== null) {
    const actions = [...match[4].matchAll(/SalesAccessAction\.([A-Z_]+)/g)].map((m) => m[1].toLowerCase());
    areas.push({ code: match[1], key: match[2], label: match[3], actions });
  }
  return areas;
}

/** Every Sales route path in App.jsx, with the element it renders. */
function salesRoutes() {
  const src = read('src/App.jsx');
  const prefixes = [
    '/sales', '/crm', '/leads', '/clients', '/contacts', '/followups', '/cprs', '/cpr/',
    '/cost-workouts', '/profit-workouts', '/quotations', '/sales-contracts', '/sales-orders',
    '/delivery-challans', '/proforma-invoices', '/packing-lists', '/invoices',
    '/payment-receipts', '/credit-notes', '/documents'
  ];
  const isSales = (path) => prefixes.some((base) => path === base
    || path.startsWith(`${base}/`)
    || (base === '/sales' && path === '/sales'));
  return [...src.matchAll(/<Route path="([^"]+)" element=\{([^}]*)/g)]
    .map((m) => ({ path: m[1], element: m[2] }))
    .filter((route) => isSales(route.path));
}

// ── the catalog ───────────────────────────────────────────────────────────

describe('Sales access · the catalog is the backend enum', () => {
  it('declares every backend area, and only those', () => {
    const backend = parseBackendAreas().map((area) => area.key).sort();
    const frontend = SALES_AREAS.map((area) => area.key).sort();
    assert.ok(backend.length >= 19, 'the backend enum must declare the real Sales areas');
    assert.deepEqual(frontend, backend);
  });

  it('offers exactly the actions each area supports on the backend', () => {
    for (const area of parseBackendAreas()) {
      const ui = SALES_AREAS.find((entry) => entry.key === area.key);
      assert.ok(ui, `${area.key} must exist in the UI catalog`);
      assert.deepEqual([...ui.actions].sort(), [...area.actions].sort(),
        `${area.key} actions must match the backend`);
    }
  });

  it('never offers an action the Sales module does not have', () => {
    const byKey = Object.fromEntries(SALES_AREAS.map((area) => [area.key, area.actions]));
    assert.deepEqual(byKey.dashboard, ['view']);
    assert.deepEqual(byKey.documents, ['view']);
    assert.deepEqual(byKey.reports, ['view', 'export']);
    assert.deepEqual(byKey.settings, ['view', 'edit']);
    // No Sales endpoint prints or generates a document server-side, so no
    // Print/Download switch may be offered.
    for (const area of SALES_AREAS) {
      assert.ok(!area.actions.includes('print'), `${area.key} must not offer Print`);
    }
    // Quotations have no approval endpoint — the switch must not exist.
    assert.ok(!byKey.quotations.includes('approve'));
    assert.ok(byKey.cpo.includes('approve'));
    assert.ok(byKey.cpr.includes('approve'));
    assert.ok(byKey.cpr.includes('submit'));
    assert.ok(byKey.leads.includes('import'));
    assert.ok(byKey.salesContracts.includes('import'));
    assert.ok(byKey.invoices.includes('send'));
    // Every rendered switch has a human label.
    for (const area of SALES_AREAS) {
      for (const action of area.actions) {
        assert.ok(ACTION_LABELS[action], `missing label for ${area.key}.${action}`);
      }
    }
  });

  it('gates the Sales sidebar modules on their member areas', () => {
    const empty = Object.fromEntries(SALES_AREAS.map((area) => [area.key, { view: false }]));
    for (const module of SALES_MODULES) {
      assert.equal(canViewModule(empty, module.key), false, `${module.key} must be hidden with nothing granted`);
    }
    const crmOnly = { ...empty, leads: { view: true } };
    assert.equal(canViewModule(crmOnly, 'crm'), true);
    assert.equal(canViewModule(crmOnly, 'cpr'), false);
    assert.equal(canViewModule(crmOnly, 'salesExec'), false);
    // A missing matrix grants nothing (fail closed).
    assert.equal(allows(undefined, 'quotations', 'view'), false);
    assert.equal(allows({ quotations: {} }, 'quotations', 'view'), false);
  });

  it('every area maps to real routes', () => {
    for (const area of SALES_AREAS) {
      assert.ok(area.routes.length > 0, `${area.key} must map to a route`);
      for (const route of area.routes) assert.match(route, /^\//);
    }
  });
});

// ── backend enforcement ───────────────────────────────────────────────────

describe('Sales access · backend enforcement', () => {
  it('the interceptor is mounted on every Sales API family', () => {
    const src = read(WEB_CONFIG);
    assert.match(src, /addInterceptors/);
    assert.match(src, /addPathPatterns\(SALES_PATHS\)/);
    for (const path of ['/quotations/**', '/invoices/**', '/leads/**', '/cprs/**',
      '/sales-orders/**', '/sales-contracts/**', '/delivery-challans/**', '/invoices/**',
      '/proforma-invoices/**', '/payment-receipts/**', '/credit-notes/**', '/cost-workouts/**',
      '/profit-workouts/**', '/customers/**', '/contacts/**', '/followups/**',
      '/sales/dashboard', '/sales/reports', '/settings/sales', '/documents']) {
      assert.ok(src.includes(`"${path}"`), `${path} must be registered with the interceptor`);
    }
    // No other module is swept up by the interceptor.
    assert.ok(!src.includes('"/marketing/**"'));
    assert.ok(!src.includes('"/purchase/**"'));
    assert.ok(!src.includes('"/production/**"'));
  });

  it('a denied request is a real 403, not a hidden button', () => {
    const src = read(INTERCEPTOR);
    assert.match(src, /SalesAccessPolicy\.resolve\(/);
    assert.match(src, /request\.getQueryString\(\)/);
    assert.match(src, /throw new ForbiddenException\(/);
    // Business validation in the services is untouched by the gate.
    assert.ok(!/quotationService|invoiceService|salesOrderService/.test(src));
  });

  it('the shared document repository stays with the existing DOCUMENT_* checks', () => {
    const src = read(POLICY);
    // The Sales layer owns the Sales-scoped read and the bare /documents route
    // only: gating /documents/** would change Production and Purchase.
    assert.match(src, /path\.equals\("\/documents"\) && isSalesScoped\(queryString\)/);
    assert.match(src, /isSalesScoped/);
    assert.ok(!/startsWith\("\/documents\/"\)/.test(src));
  });

  it('Access Management itself is ADMIN-only and never self-serviceable', () => {
    const src = read(CONTROLLER);
    const adminGated = (mapping) => {
      const index = src.indexOf(`    ${mapping}`);
      if (index === -1) return false;
      const methodHead = src.slice(index, src.indexOf('public ', index));
      return methodHead.includes("@PreAuthorize(\"hasAuthority('ROLE_ADMIN')\")");
    };
    assert.ok(adminGated('@GetMapping("/options")'), 'options must be ADMIN-only');
    assert.ok(adminGated('@GetMapping("/scope/{scopeType}/{scopeKey}")'), 'reading a scope must be ADMIN-only');
    assert.ok(adminGated('@PutMapping("/scope/{scopeType}/{scopeKey}")'), 'saving a scope must be ADMIN-only');
    assert.ok(adminGated('@DeleteMapping("/scope/{scopeType}/{scopeKey}")'), 'resetting a scope must be ADMIN-only');
    // /me is the only self-readable endpoint, and it cannot write.
    assert.match(src, /@GetMapping\("\/me"\)/);
    assert.ok(!/@PutMapping\("\/me"\)/.test(src));
  });

  it('the Sales Settings write also requires settings.edit', () => {
    const src = read(SETTINGS_CONTROLLER);
    assert.match(
      src,
      /@PreAuthorize\("hasAuthority\('SETTINGS_MANAGE'\) and @salesAccess\.can\('settings','edit'\)"\)/
    );
  });

  it('the Sales scoped read is refused when the Sales listing has no View', () => {
    // Mirrors SalesAccessPolicy.resolve() for the one shared path it owns.
    const src = read(POLICY);
    assert.match(src, /SalesAccessArea\.DOCUMENTS/);
    assert.match(src, /SalesAccessAction\.VIEW/);
  });

  it('denials fail closed on an unreadable configuration', () => {
    const src = read(SERVICE);
    assert.match(src, /SalesAccessPolicy\.denyAll\(\)/);
    assert.match(src, /unreadable|invalid JSON/i);
    assert.match(src, /an absent permission is OFF/i);
    assert.match(src, /invalid.*true|invalid\)/);
  });

  it('permissions are derived server-side from the authenticated principal', () => {
    const src = read(SERVICE);
    assert.match(src, /SecurityContextHolder\.getContext\(\)\.getAuthentication\(\)/);
    assert.match(src, /getAuthorities\(\)/);
    assert.ok(!/getParameter\(["']role/.test(src));
  });

  it('the default for an unconfigured role is derived from the existing role permissions', () => {
    const src = read(POLICY);
    assert.match(src, /RolePermissions\.permissionsOf\(role\)/);
    // ADMIN-only settings writes by default; readable by every signed-in role.
    assert.match(src, /Permission\.SETTINGS_MANAGE/);
  });
});

// ── persistence ───────────────────────────────────────────────────────────

describe('Sales access · persistence & precedence', () => {
  it('uses the existing app_settings store with one row per scope', () => {
    const src = read(SERVICE);
    assert.match(src, /KEY_PREFIX = "sales_access\."/);
    assert.match(src, /appSettingRepository\.upsert\(key, serialized\)/);
    assert.match(src, /settingKey\(scopeType, scopeKey\)/);
    assert.match(src, /appSettingRepository\.findBySettingKey\(/);
    // The configuration is audited like every other settings write, and a Sales
    // save can never touch a Marketing row (different key prefix).
    assert.match(src, /new SettingsAuditLog\(/);
    assert.ok(!/mkting_access/.test(src));
  });

  it('resolves user over role over default, per area', () => {
    const src = read(SERVICE);
    assert.match(src, /SCOPE_USER/);
    assert.match(src, /SCOPE_ROLE/);
    assert.match(src, /user configuration → role configuration → documented/);
  });

  it('the browser never stores authoritative permissions in web storage', () => {
    for (const file of [
      'src/sales/access/useSalesAccess.js',
      'src/services/salesAccessService.js',
      'src/pages/sales/SalesSettings.jsx'
    ]) {
      const src = read(file);
      assert.ok(!/localStorage\./.test(src), `${file} must not use localStorage`);
      assert.ok(!/sessionStorage\./.test(src), `${file} must not use sessionStorage`);
    }
  });

  it('a failed load grants nothing (fail closed)', () => {
    const hook = read('src/sales/access/useSalesAccess.js');
    assert.match(hook, /publish\(\{ \.\.\.INITIAL, status: 'error', error \}\)/);
    assert.match(hook, /emptyPermissions\(\)/);
  });

  it('the permission matrix always starts from an all-OFF skeleton', () => {
    const catalog = read('src/sales/access/catalog.js');
    assert.match(catalog, /export function emptyPermissions\(\)/);
    assert.match(catalog, /for \(const action of area\.actions\) actions\[action\] = false;/);
  });
});

// ── UI ────────────────────────────────────────────────────────────────────

describe('Sales access · UI', () => {
  it('Access Management is a section of Sales Settings, ADMIN-only', () => {
    const src = read('src/pages/sales/SalesSettings.jsx');
    assert.match(src, /key: 'access', label: 'Access Management'/);
    assert.match(src, /adminOnly: true/);
    // The rail stays exactly as it was for everyone else.
    assert.match(src, /const navGroups = useMemo\(\(\) => \(isAdminUser/);
    assert.match(src, /items\.filter\(\(item\) => !item\.adminOnly\)/);
    // Saves through the dedicated access API, not the settings blob.
    assert.match(src, /salesAccessService\.saveScope\(/);
    assert.match(src, /salesAccessService\.resetScope\(/);
    // The section renders the same matrix from the same catalog.
    assert.match(src, /SALES_AREAS\.map\(\(area\) => \{/);
    assert.match(src, /case 'access': return renderAccess\(\);/);
    // Role and user scopes.
    assert.match(src, /<option value="ROLE">Role<\/option>/);
    assert.match(src, /<option value="USER">User<\/option>/);
    // Configured vs inherited is stated explicitly.
    assert.match(src, /accessScopeData\?\.configured/);
  });

  it('reuses the Marketing Access Management matrix stylesheet', () => {
    assert.match(read('src/pages/sales/SalesSettings.jsx'),
      /import '\.\.\/\.\.\/components\/Marketing\/marketing-access\.css';/);
  });

  it('every Sales route is behind the View gate', () => {
    const routes = salesRoutes();
    assert.ok(routes.length >= 100, `the Sales routes must still be registered (saw ${routes.length})`);
    for (const route of routes) {
      assert.match(route.element, /SalesAccessGuard/, `${route.path} must be gated`);
    }
    const src = read('src/App.jsx');
    // The module hubs require at least one visible member area, the rest their own.
    assert.match(src, /<SalesAccessGuard area="salesExec">/);
    assert.match(src, /<SalesAccessGuard area="crm">/);
    assert.match(src, /<SalesAccessGuard area="cpr">/);
    for (const area of SALES_AREAS) {
      assert.ok(src.includes(`<SalesAccessGuard area="${area.key}"`),
        `${area.key} must be guarded by its own area`);
    }
    // The create/edit forms keep their own action.
    assert.match(src, /<SalesAccessGuard area="quotations" action="create">/);
    assert.match(src, /<SalesAccessGuard area="invoices" action="edit">/);
    assert.match(src, /<SalesAccessGuard area="salesContracts" action="import">/);
  });

  it('the Sales navigation hides what the user may not view', () => {
    const src = read('src/components/Layout/SalesNav.jsx');
    assert.match(src, /useSalesAccess/);
    assert.match(src, /case 'salesDashboard': return salesAllows\(salesPermissions, 'dashboard', 'view'\);/);
    assert.match(src, /case 'crm': return canViewSalesModule\(salesPermissions, 'crm'\);/);
    assert.match(src, /case 'cpr': return canViewSalesModule\(salesPermissions, 'cpr'\);/);
    assert.match(src, /case 'salesExec': return canViewSalesModule\(salesPermissions, 'salesExec'\);/);
    assert.match(src, /case 'salesSettings': return salesAllows\(salesPermissions, 'settings', 'view'\);/);
  });

  it('the API service calls the endpoints the backend exposes', () => {
    const src = read('src/services/salesAccessService.js');
    assert.match(src, /api\.get\('\/sales\/access\/me'\)/);
    assert.match(src, /api\.get\('\/sales\/access\/options'\)/);
    assert.match(src, /`\/sales\/access\/scope\/\$\{encodeURIComponent\(scopeType\)\}\/\$\{encodeURIComponent\(scopeKey\)\}`/);
    assert.match(src, /api\.put\(/);
    assert.match(src, /api\.delete\(/);
  });

  it('signing out drops the in-memory Sales permissions', () => {
    assert.match(read('src/components/Layout/AppLayout.jsx'), /clearSalesAccess\(\);/);
  });

  it('Marketing access management is untouched', () => {
    const marketing = read('src/pages/marketing/MarketingSettings.jsx');
    assert.match(marketing, /key: 'access', label: 'Access Management'/);
    assert.match(marketing, /marketingAccessService\.saveScope\(/);
    // Its own catalog, service, hook and backend package all still exist.
    assert.match(read('src/marketing/access/catalog.js'), /MARKETING_AREAS/);
    assert.match(read('src/services/marketingAccessService.js'), /\/marketing\/access\/me/);
    assert.match(read(`${BACKEND}marketing/access/MarketingAccessService.java`), /mkting_access\./);
    // Marketing routes are still gated by the Marketing guard, not the Sales one.
    const app = read('src/App.jsx');
    const marketingRoutes = [...app.matchAll(/<Route path="(\/marketing[^"]*)" element=\{([^}]*)/g)];
    assert.ok(marketingRoutes.length >= 15);
    for (const route of marketingRoutes) {
      assert.match(route[2], /MarketingAccessGuard/);
      assert.ok(!route[2].includes('SalesAccessGuard'), `${route[1]} must not use the Sales guard`);
    }
  });
});
