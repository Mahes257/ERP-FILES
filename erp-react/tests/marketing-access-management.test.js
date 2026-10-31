/**
 * tests/marketing-access-management.test.js
 * ------------------------------------------------------------------
 * Marketing · Access Management (Marketing Settings → Access Management).
 *
 *   CATALOG      the UI's area/action catalog is the backend enum — same areas,
 *                same actions per area — so a switch can never be rendered for a
 *                permission the server does not know (or vice versa)
 *   ENFORCEMENT  every Marketing API is covered by the server-side interceptor
 *                (mapped on /marketing/**), the Access Management endpoints stay
 *                ADMIN-only, and the Marketing Settings write honours the
 *                settings.edit permission
 *   PERSISTENCE  permissions live only in the backend (existing app_settings
 *                store, one row per scope); the browser never keeps them in
 *                localStorage/sessionStorage and never treats a failed load as
 *                "allow"
 *   UI           the Access Management section exists inside Marketing Settings,
 *                is ADMIN-only, and every Marketing route is behind the View gate
 *
 * Run: node --test tests/marketing-access-management.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { MARKETING_AREAS, ACTION_LABELS } from '../src/marketing/access/catalog.js';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const BACKEND = 'erp-backend/src/main/java/com/vishatech/erp/';
const ACCESS_PKG = `${BACKEND}marketing/access/`;
const AREA_ENUM = `${ACCESS_PKG}MarketingAccessArea.java`;
const ACTION_ENUM = `${ACCESS_PKG}MarketingAccessAction.java`;
const SERVICE = `${ACCESS_PKG}MarketingAccessService.java`;
const CONTROLLER = `${ACCESS_PKG}MarketingAccessController.java`;
const INTERCEPTOR = `${ACCESS_PKG}MarketingAccessInterceptor.java`;
const WEB_CONFIG = `${ACCESS_PKG}MarketingAccessWebConfig.java`;
const POLICY = `${ACCESS_PKG}MarketingAccessPolicy.java`;
const SETTINGS_CONTROLLER = `${BACKEND}controller/MarketingSettingsController.java`;

/** Parse the area enum: code, key, and the actions listed for it. */
function parseBackendAreas() {
  const src = read(AREA_ENUM);
  const body = src.slice(src.indexOf('public enum MarketingAccessArea'), src.indexOf('private final String key;'));
  const areas = [];
  const entry = /\n {4}([A-Z_]+)\("([^"]+)",\s*"([^"]+)",([\s\S]*?)\)[,;]\n/g;
  let match;
  while ((match = entry.exec(`${body}\n`)) !== null) {
    const actions = [...match[4].matchAll(/MarketingAccessAction\.([A-Z_]+)/g)].map((m) => m[1].toLowerCase());
    areas.push({ code: match[1], key: match[2], label: match[3], actions });
  }
  return areas;
}

// ── the catalog ───────────────────────────────────────────────────────────

describe('Marketing access · the catalog is the backend enum', () => {
  it('declares every backend area, and only those', () => {
    const backend = parseBackendAreas().map((area) => area.key).sort();
    const frontend = MARKETING_AREAS.map((area) => area.key).sort();
    assert.ok(backend.length > 0, 'the backend enum must declare Marketing areas');
    assert.deepEqual(frontend, backend);
  });

  it('offers exactly the actions each area supports on the backend', () => {
    for (const area of parseBackendAreas()) {
      const ui = MARKETING_AREAS.find((entry) => entry.key === area.key);
      assert.ok(ui, `${area.key} must exist in the UI catalog`);
      assert.deepEqual(
        [...ui.actions].sort(),
        [...area.actions].sort(),
        `${area.key} actions must match the backend`
      );
    }
  });

  it('never offers an action the module does not have', () => {
    // Pages with no delete never offer delete; view-only pages offer only view.
    const byKey = Object.fromEntries(MARKETING_AREAS.map((area) => [area.key, area.actions]));
    assert.deepEqual(byKey.dashboard, ['view']);
    assert.deepEqual(byKey.calendar, ['view']);
    assert.deepEqual(byKey.settings, ['view', 'edit']);
    assert.ok(!byKey.dashboard.includes('delete'));
    assert.ok(byKey.expenses.includes('approve'));
    assert.ok(byKey.qforms.includes('print'));
    // Every rendered switch has a human label.
    for (const area of MARKETING_AREAS) {
      for (const action of area.actions) {
        assert.ok(ACTION_LABELS[action], `missing label for ${area.key}.${action}`);
      }
    }
  });

  it('declares upload for the map, whose detail panel really uploads photos', () => {
    // Regression: the request policy maps
    // POST /marketing/map/locations/{id}/photos to (map, upload), and
    // MarketingAccessService.can() refuses any area/action pair the area does
    // not declare. While MAP was missing UPLOAD every photo upload was a
    // permanent 403 — including for ADMIN, with no switch able to grant it.
    const map = parseBackendAreas().find((area) => area.key === 'map');
    assert.ok(map, 'the map area must exist');
    assert.ok(map.actions.includes('upload'), 'map must declare upload');
    const ui = MARKETING_AREAS.find((area) => area.key === 'map');
    assert.ok(ui.actions.includes('upload'), 'the UI must offer the map Upload switch');
  });

  it('every Marketing request the UI makes resolves to an action its area declares', () => {
    // Mirrors MarketingAccessPolicy.resolve(). The policy can ask for an action
    // an area does not declare, and can() then answers "no" for everybody —
    // which is how the map photo upload broke. This walks the real endpoints
    // the frontend calls and fails on any such pair.
    const APPROVAL_SUFFIXES = ['approve', 'reject', 'revision'];
    const UPLOAD_SUFFIXES = ['attachments', 'photos', 'bill'];
    const COLLECTIONS = {
      qforms: '/marketing/q-forms',
      expenses: '/marketing/expenses',
      travelRegistry: '/marketing/travel-plans',
      travelScheduler: '/marketing/travel-schedules',
      map: '/marketing/map/locations'
    };
    const areaOf = (path) => {
      const prefixes = [
        ['dashboard', '/marketing/dashboard'],
        ['qforms', '/marketing/q-forms'],
        ['expenses', '/marketing/expenses'],
        ['travelRegistry', '/marketing/travel-plans'],
        ['travelScheduler', '/marketing/travel-schedules'],
        ['calendar', '/marketing/calendar'],
        ['map', '/marketing/map'],
        ['map', '/marketing/location-tracking'],
        ['followups', '/marketing/follow-ups'],
        ['followups', '/marketing/activities'],
        ['visits', '/marketing/visits'],
        ['visits', '/marketing/leads']
      ];
      const hit = prefixes.find(([, base]) => path === base || path.startsWith(`${base}/`));
      if (hit) return hit[0];
      return ['/marketing/search', '/marketing/summary', '/marketing/performance'].includes(path)
        ? 'visits' : null;
    };
    const resolve = (method, fullPath) => {
      const path = fullPath.toLowerCase();
      const verb = method.toUpperCase();
      if (path === '/marketing/access' || path.startsWith('/marketing/access/')) return null;
      const area = areaOf(path);
      if (!area) return null;
      if (verb === 'GET' || verb === 'OPTIONS' || verb === 'HEAD') return { area, action: 'view' };
      if (verb === 'DELETE') return { area, action: 'delete' };
      const last = path.slice(path.lastIndexOf('/') + 1);
      if (APPROVAL_SUFFIXES.includes(last)) return { area, action: 'approve' };
      if (verb === 'POST' && UPLOAD_SUFFIXES.includes(last)) return { area, action: 'upload' };
      if (COLLECTIONS[area] === path) return { area, action: 'create' };
      if (area === 'visits' && ['/marketing/visits', '/marketing/leads', '/marketing/follow-ups'].includes(path)) {
        return { area, action: 'create' };
      }
      return { area, action: 'edit' };
    };

    const declared = Object.fromEntries(parseBackendAreas().map((area) => [area.key, area.actions]));
    const callRe = /api\.(get|post|put|patch|delete)\(\s*[`']([^`']+)[`']/g;
    let scanned = 0;
    for (const file of ['src/services/marketingService.js', 'src/services/marketingAccessService.js']) {
      const src = read(file);
      let match;
      while ((match = callRe.exec(src)) !== null) {
        const raw = match[2].split('?')[0].replace(/\$\{[^}]*\}/g, '1');
        if (!raw.startsWith('/marketing')) continue;
        const requirement = resolve(match[1], raw);
        if (!requirement) continue;
        scanned += 1;
        assert.ok(
          declared[requirement.area]?.includes(requirement.action),
          `${match[1].toUpperCase()} ${raw} needs ${requirement.area}.${requirement.action}, ` +
          `which that area does not declare — the request would be a permanent 403`
        );
      }
    }
    assert.ok(scanned >= 50, `expected to scan the Marketing API surface, saw ${scanned}`);
  });

  it('every area maps to real routes', () => {
    for (const area of MARKETING_AREAS) {
      assert.ok(area.routes.length > 0, `${area.key} must map to a route`);
      for (const route of area.routes) assert.match(route, /^\/marketing(\/|$)/);
    }
  });
});

// ── backend enforcement ───────────────────────────────────────────────────

describe('Marketing access · backend enforcement', () => {
  it('the interceptor is mounted on the whole Marketing module', () => {
    const src = read(WEB_CONFIG);
    assert.match(src, /addInterceptors/);
    assert.match(src, /addPathPatterns\("\/marketing\/\*\*"\)/);
  });

  it('a denied request is a real 403, not a hidden button', () => {
    const src = read(INTERCEPTOR);
    assert.match(src, /MarketingAccessPolicy\.resolve\(request\.getMethod\(\), path\)/);
    assert.match(src, /throw new ForbiddenException\(/);
    // Business validation in the services is untouched by the gate.
    assert.ok(!/marketingVisitService|expenseTripService|travelPlanService/.test(src));
  });

  it('Access Management itself is ADMIN-only and never self-serviceable', () => {
    const src = read(CONTROLLER);
    // The annotation closest to the mapping must be the ADMIN gate.
    const adminGated = (mapping) => {
      const index = src.indexOf(`    ${mapping}`);
      if (index === -1) return false;
      const methodHead = src.slice(index, src.indexOf('public ', index));
      return methodHead.includes("@PreAuthorize(\"hasAuthority('ROLE_ADMIN')\")");
    };
    assert.ok(adminGated('@GetMapping("/options")'), 'options must be ADMIN-only');
    assert.ok(
      adminGated('@GetMapping("/scope/{scopeType}/{scopeKey}")'),
      'reading another scope must be ADMIN-only'
    );
    assert.ok(
      adminGated('@PutMapping("/scope/{scopeType}/{scopeKey}")'),
      'saving a scope must be ADMIN-only'
    );
    assert.ok(
      adminGated('@DeleteMapping("/scope/{scopeType}/{scopeKey}")'),
      'resetting a scope must be ADMIN-only'
    );
    // /me is the only self-readable endpoint, and it cannot write.
    assert.match(src, /@GetMapping\("\/me"\)/);
    assert.ok(!/@PutMapping\("\/me"\)/.test(src));
  });

  it('the Marketing Settings write also requires settings.edit', () => {
    const src = read(SETTINGS_CONTROLLER);
    assert.match(
      src,
      /@PreAuthorize\("hasAuthority\('SETTINGS_MANAGE'\) and @marketingAccess\.can\('settings','edit'\)"\)/
    );
  });

  it('denials fail closed on an unreadable configuration', () => {
    const src = read(SERVICE);
    assert.match(src, /MarketingAccessPolicy\.denyAll\(\)/);
    assert.match(src, /unreadable|invalid JSON/i);
    // A missing action inside a saved configuration is OFF.
    assert.match(src, /an absent permission is OFF/i);
  });

  it('permissions are derived server-side from the authenticated principal', () => {
    const src = read(SERVICE);
    assert.match(src, /SecurityContextHolder\.getContext\(\)\.getAuthentication\(\)/);
    assert.match(src, /setRole|getAuthorities\(\)/);
    // Nothing reads a role/permission from the request body.
    assert.ok(!/getParameter\(["']role/.test(src));
  });
});

// ── persistence ───────────────────────────────────────────────────────────

describe('Marketing access · persistence', () => {
  it('uses the existing app_settings store with one row per scope', () => {
    const src = read(SERVICE);
    assert.match(src, /KEY_PREFIX = "mkting_access\."/);
    assert.match(src, /appSettingRepository\.upsert\(key, serialized\)/);
    // Per-scope rows are what stop one user's save from overwriting another's.
    assert.match(src, /settingKey\(scopeType, scopeKey\)/);
    assert.match(src, /appSettingRepository\.findBySettingKey\(/);
    // The configuration is audited like every other settings write.
    assert.match(src, /new SettingsAuditLog\(/);
  });

  it('the browser never stores authoritative permissions in web storage', () => {
    for (const file of [
      'src/marketing/access/useMarketingAccess.js',
      'src/services/marketingAccessService.js',
      'src/pages/marketing/MarketingSettings.jsx'
    ]) {
      const src = read(file);
      // Comments may mention the web-storage keys; a real read/write may not.
      assert.ok(!/localStorage\./.test(src), `${file} must not use localStorage`);
      assert.ok(!/sessionStorage\./.test(src), `${file} must not use sessionStorage`);
    }
  });

  it('a failed load grants nothing (fail closed)', () => {
    const hook = read('src/marketing/access/useMarketingAccess.js');
    assert.match(hook, /publish\(\{ \.\.\.INITIAL, status: 'error', error \}\)/);
    assert.match(hook, /emptyPermissions\(\)/);
  });

  it('the permission matrix always starts from an all-OFF skeleton', () => {
    const catalog = read('src/marketing/access/catalog.js');
    assert.match(catalog, /export function emptyPermissions\(\)/);
    assert.match(catalog, /for \(const action of area\.actions\) actions\[action\] = false;/);
  });
});

// ── UI ────────────────────────────────────────────────────────────────────

describe('Marketing access · UI', () => {
  it('Access Management is a section of Marketing Settings, ADMIN-only', () => {
    const src = read('src/pages/marketing/MarketingSettings.jsx');
    assert.match(src, /key: 'access', label: 'Access Management'/);
    assert.match(src, /adminOnly: true/);
    // The rail is grouped (Sales Settings parity); the ADMIN-only group AND
    // its item are filtered out for everyone else.
    assert.match(src, /const navGroups = useMemo\(\(\) => NAV_GROUPS/);
    assert.match(src, /filter\(\(group\) => !group\.adminOnly \|\| isAdmin\)/);
    assert.match(src, /items: group\.items\.filter\(\(item\) => !item\.adminOnly \|\| isAdmin\)/);
    // Saves through the dedicated access API, not the settings blob.
    assert.match(src, /marketingAccessService\.saveScope\(/);
    assert.match(src, /marketingAccessService\.resetScope\(/);
  });

  it('Configuration Health counts Access Management only from real configuration', () => {
    const src = read('src/services/marketingSettingsService.js');
    assert.match(src, /getConfigHealth\(accessStatus\)/);
    assert.match(src, /label: 'Access Management'/);
    assert.match(src, /configured: Boolean\(accessStatus\.configured\)/);
  });

  it('every Marketing route is behind the View gate', () => {
    const src = read('src/App.jsx');
    const marketingRoutes = [...src.matchAll(/<Route path="(\/marketing[^"]*)" element=\{([^}]*)/g)]
      .map((m) => ({ path: m[1], element: m[2] }));
    assert.ok(marketingRoutes.length >= 15, 'the Marketing routes must still be registered');
    for (const route of marketingRoutes) {
      assert.match(route.element, /MarketingAccessGuard/, `${route.path} must be gated`);
    }
    // The hub requires at least one visible area, the rest require their own.
    assert.match(src, /<MarketingAccessGuard area="hub">/);
    for (const area of MARKETING_AREAS) {
      if (area.key === 'dashboard' || area.key === 'calendar') continue;
      assert.ok(
        src.includes(`<MarketingAccessGuard area="${area.key}"`),
        `${area.key} must be guarded by its own area`
      );
    }
  });

  it('the Marketing navigation hides what the user may not view', () => {
    const src = read('src/components/Layout/SalesNav.jsx');
    assert.match(src, /useMarketingAccess/);
    assert.match(src, /if \(child\.key === 'marketingHub'\) return canViewHub;/);
    assert.match(src, /if \(child\.key === 'marketingSettings'\) return can\('settings', 'view'\);/);
  });

  it('the hub hides tabs whose View is OFF', () => {
    const src = read('src/pages/marketing/MarketingHub.jsx');
    assert.match(src, /const tabs = TABS\.filter\(\(tab\) => can\(AREA_BY_TAB\[tab\.key\], 'view'\)\)/);
    assert.match(src, /\{tabs\.map\(\(tab\) => \{/);
  });

  it('page actions are gated on their own permission', () => {
    const expectations = [
      ['src/pages/marketing/VisitSummaryPage.jsx', ["can('visits', 'create')", "can('visits', 'edit')", "can('visits', 'export')"]],
      ['src/components/Marketing/MarketingExpenses.jsx', ["can('expenses', 'approve')", "can('expenses', 'print')", "can('expenses', 'upload')", "can('expenses', 'delete')"]],
      ['src/components/Marketing/QFormList.jsx', ["can('qforms', 'create')", "can('qforms', 'delete')", "can('qforms', 'print')"]],
      ['src/components/Marketing/TravelPlanner.jsx', ["can('travelRegistry', 'approve')", "can('travelRegistry', 'delete')"]],
      ['src/components/Marketing/TravelScheduler.jsx', ["can('travelScheduler', 'approve')", "can('travelScheduler', 'delete')"]],
      ['src/components/Marketing/VisitFollowUpExtension.jsx', ["can('followups', 'edit')", "can('followups', 'delete')"]],
      ['src/components/Marketing/MarketingMapPage.jsx', ["can('map', 'create')", "can('travelRegistry', 'create')", "can('travelRegistry', 'delete')"]],
      ['src/components/Marketing/LocationDetailPanel.jsx', ["canMapAction('map', 'upload')", "canMapAction('map', 'delete')"]]
    ];
    for (const [file, gates] of expectations) {
      const src = read(file);
      for (const gate of gates) {
        assert.ok(src.includes(gate), `${file} must gate on ${gate}`);
      }
    }
  });

  it('the API service calls the endpoints the backend exposes', () => {
    const src = read('src/services/marketingAccessService.js');
    assert.match(src, /api\.get\('\/marketing\/access\/me'\)/);
    assert.match(src, /api\.get\('\/marketing\/access\/options'\)/);
    assert.match(src, /`\/marketing\/access\/scope\/\$\{encodeURIComponent\(scopeType\)\}\/\$\{encodeURIComponent\(scopeKey\)\}`/);
    assert.match(src, /api\.put\(/);
    assert.match(src, /api\.delete\(/);
  });
});
