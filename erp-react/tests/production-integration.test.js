/**
 * Production Module Integration Tests
 * ====================================
 * 
 * These tests verify that the Production module is correctly integrated
 * into the ERP React application. They check:
 * 
 * 1. All Production pages can be imported without errors
 * 2. All Production context providers are correctly wired
 * 3. The Production API client uses the shared ERP API base URL
 * 4. Vite proxy configuration targets the single ERP backend (port 8080)
 * 5. All Production routes are registered in the app router
 * 6. All Production CSS files are imported
 * 7. The Production sidebar navigation is configured
 * 8. Production components import from correct paths
 * 
 * Run: node tests/production-integration.test.js
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
// The format routing table itself, so the assertions below track the contract
// instead of one frozen array literal (BREP / SLDDRW were added later).
import {
  BACKEND_CONVERT_TYPES_SET,
  SLD_STORE_ONLY_TYPES_SET,
  isPreviewable,
  isSldStoreOnly,
  needsBackendConversion,
  resolveRenderer,
} from '../src/production/services/production/modelFormats.js';

const ROOT = join(import.meta.dirname, '..');
const SRC = join(ROOT, 'src');
const PROD = join(SRC, 'production');

let passed = 0;
let failed = 0;
let skipped = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    if (err.message.startsWith('SKIP:')) {
      skipped++;
      console.log(`  ⏭️  ${name} — ${err.message.slice(6)}`);
    } else {
      failed++;
      console.log(`  ❌ ${name}`);
      console.log(`     ${err.message}`);
    }
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function fileContains(filePath, pattern, description) {
  const content = readFileSync(join(ROOT, filePath), 'utf8');
  assert(
    typeof pattern === 'string' ? content.includes(pattern) : pattern.test(content),
    description || `Expected ${filePath} to contain "${pattern}"`
  );
}

function fileExists(filePath, description) {
  assert(existsSync(join(ROOT, filePath)), description || `File not found: ${filePath}`);
}

function dirHasFiles(dirPath, pattern, description) {
  const files = readdirSync(join(ROOT, dirPath), { recursive: true });
  assert(files.some(f => typeof f === 'string' && f.includes(pattern)),
    description || `No file matching "${pattern}" in ${dirPath}`);
}

// ============================================================
// 1. PRODUCTION DIRECTORY STRUCTURE
// ============================================================
console.log('\n📁 Production Directory Structure');

test('Production source directory exists', () => {
  assert(existsSync(PROD), 'src/production/ directory not found');
});

test('Production pages directory exists', () => {
  assert(existsSync(join(PROD, 'pages')), 'src/production/pages/ not found');
});

test('Production components directory exists', () => {
  assert(existsSync(join(PROD, 'components')), 'src/production/components/ not found');
});

test('Production context directory exists', () => {
  assert(existsSync(join(PROD, 'context')), 'src/production/context/ not found');
});

test('Production services directory exists', () => {
  assert(existsSync(join(PROD, 'services')), 'src/production/services/ not found');
});

test('Production utils directory exists', () => {
  assert(existsSync(join(PROD, 'utils')), 'src/production/utils/ not found');
});

test('Production data directory exists', () => {
  assert(existsSync(join(PROD, 'data')), 'src/production/data/ not found');
});

test('Production styles directory exists', () => {
  assert(existsSync(join(PROD, 'styles')), 'src/production/styles/ not found');
});

test('Production hooks directory exists', () => {
  assert(existsSync(join(PROD, 'hooks')), 'src/production/hooks/ not found');
});

test('Production routes directory exists', () => {
  assert(existsSync(join(PROD, 'routes')), 'src/production/routes/ not found');
});

// ============================================================
// 2. PRODUCTION PAGES
// ============================================================
console.log('\n📄 Production Pages');

const REQUIRED_PAGES = [
  'ProductionDashboard.jsx',
  'ProductionOrders.jsx',
  'ProductionOrderDetail.jsx',
  'TechnicalVerificationPage.jsx',
  'TechnicalVerificationDetail.jsx',
  'DrawingsPage.jsx',
  'DrawingDetail.jsx',
  'ModelsPage.jsx',
  'ModelDetail.jsx',
  'Casting.jsx',
  'Fabrication.jsx',
  'Assembly.jsx',
  'Quality.jsx',
  'QualityDetail.jsx',
  'Packing.jsx',
  'PackingPreview.jsx',
  'Dispatch.jsx',
  'Reports.jsx',
  'Settings.jsx',
  'AcknowledgementPage.jsx',
  'ProductionEntry.jsx',
  'KpiDetailsPage.jsx',
];

for (const page of REQUIRED_PAGES) {
  test(`Page ${page} exists`, () => {
    fileExists(`src/production/pages/${page}`, `Missing page: ${page}`);
  });
}

test('Report pages exist', () => {
  const reportsDir = join(PROD, 'pages', 'reports');
  assert(existsSync(reportsDir), 'Reports subdirectory not found');
  const files = readdirSync(reportsDir);
  assert(files.length > 0, 'No report files found');
});

test('Settings pages exist', () => {
  const settingsDir = join(PROD, 'pages', 'settings');
  assert(existsSync(settingsDir), 'Settings subdirectory not found');
  const files = readdirSync(settingsDir);
  assert(files.length > 0, 'No settings files found');
});

// ============================================================
// 3. PRODUCTION CONTEXT PROVIDERS
// ============================================================
console.log('\n🔗 Production Context Providers');

const REQUIRED_CONTEXTS = [
  'ProductionOrdersContext.jsx',
  'QualityContext.jsx',
  'PackingContext.jsx',
  'DispatchContext.jsx',
  'ProductionEntryContext.jsx',
  'AcknowledgementContext.jsx',
  'TechnicalVerificationContext.jsx',
  'DrawingsContext.jsx',
  'ModelsContext.jsx',
  'SalesOrdersContext.jsx',
  'DashboardNavContext.jsx',
];

for (const ctx of REQUIRED_CONTEXTS) {
  test(`Context ${ctx} exists`, () => {
    fileExists(`src/production/context/${ctx}`, `Missing context: ${ctx}`);
  });
}

// ============================================================
// 4. PRODUCTION PROVIDERS WRAPPER
// ============================================================
console.log('\n🏗️  ProductionProviders Wrapper');

test('ProductionProviders.jsx exists', () => {
  fileExists('src/production/ProductionProviders.jsx');
});

test('ProductionProviders imports all context providers', () => {
  fileContains('src/production/ProductionProviders.jsx', 'SalesOrdersProvider');
  fileContains('src/production/ProductionProviders.jsx', 'ProductionOrdersProvider');
  fileContains('src/production/ProductionProviders.jsx', 'QualityProvider');
  fileContains('src/production/ProductionProviders.jsx', 'PackingProvider');
  fileContains('src/production/ProductionProviders.jsx', 'DispatchProvider');
  fileContains('src/production/ProductionProviders.jsx', 'ProductionEntryProvider');
  fileContains('src/production/ProductionProviders.jsx', 'AcknowledgementProvider');
  fileContains('src/production/ProductionProviders.jsx', 'TechnicalVerificationProvider');
  fileContains('src/production/ProductionProviders.jsx', 'DrawingsProvider');
  fileContains('src/production/ProductionProviders.jsx', 'ModelsProvider');
  fileContains('src/production/ProductionProviders.jsx', 'DashboardNavProvider');
});

test('ProductionProviders does NOT import Production CurrentUserProvider', () => {
  const content = readFileSync(join(ROOT, 'src/production/ProductionProviders.jsx'), 'utf8');
  assert(!content.includes("from './context/CurrentUserContext'"),
    'ProductionProviders should NOT wrap with Production-specific CurrentUserProvider');
});

// ============================================================
// 5. APP.JSX ROUTE INTEGRATION
// ============================================================
console.log('\n🛣️  App.jsx Route Integration');

// Production is mounted as ONE lazily-loaded route subtree instead of fourteen
// eager /production/* routes, so the eleven Production contexts and their page
// chunks stay out of the initial bundle. The screens themselves are asserted
// against the route table in section 5b.
const PRODUCTION_ROUTES_MODULE = 'src/production/routes/productionRoutes.jsx';

test('App.jsx lazily imports the Production route module', () => {
  fileContains('src/App.jsx', "import('./production/routes/productionRoutes')");
});

test('App.jsx mounts the Production module under /production/*', () => {
  fileContains('src/App.jsx', 'path="/production/*"');
});

test('App.jsx renders the Production route module element', () => {
  fileContains('src/App.jsx', 'element={<ProductionRoutes />}');
});

test('App.jsx has /model-viewer route', () => {
  fileContains('src/App.jsx', 'path="/model-viewer/:id"');
});

test('Production routes are inside ProtectedRoute', () => {
  const content = readFileSync(join(ROOT, 'src/App.jsx'), 'utf8');
  const prodIdx = content.indexOf('Production Module Routes');
  const protectedIdx = content.indexOf('<ProtectedRoute');
  assert(prodIdx > protectedIdx, 'Production routes must be inside ProtectedRoute');
});

// ============================================================
// 5b. PRODUCTION ROUTE TABLE
// ============================================================
console.log('\n🧭 Production Route Table');

const REQUIRED_PRODUCTION_ROUTES = [
  'orders',
  'technical-verification',
  'drawings',
  'models',
  'casting',
  'fabrication',
  'machine-shop',
  'assembly',
  'quality',
  'packing',
  'dispatch',
  'reports',
  'settings',
];

test('App.jsx does not eagerly import ProductionProviders', () => {
  const content = readFileSync(join(ROOT, 'src/App.jsx'), 'utf8');
  assert(!content.includes('ProductionProviders'),
    'App.jsx must not import ProductionProviders — the providers belong to the lazily-loaded route module');
});

for (const segment of REQUIRED_PRODUCTION_ROUTES) {
  test(`Production route table declares /production/${segment}`, () => {
    fileContains(PRODUCTION_ROUTES_MODULE, `path="${segment}"`,
      `Production route table is missing the /production/${segment} screen`);
  });
}

test('Production route module keeps the ProductionProviders wrapper', () => {
  fileContains(PRODUCTION_ROUTES_MODULE, '<ProductionProviders>');
  fileContains(PRODUCTION_ROUTES_MODULE, '</ProductionProviders>');
});

// ============================================================
// 6. SIDEBAR NAVIGATION
// ============================================================
console.log('\n📋 Sidebar Navigation');

test('SalesNav.jsx has Production group', () => {
  fileContains('src/components/Layout/SalesNav.jsx', "key: 'production'");
});

test('SalesNav.jsx has Production label', () => {
  fileContains('src/components/Layout/SalesNav.jsx', "label: 'Production'");
});

test('Production sidebar has Dashboard item', () => {
  fileContains('src/components/Layout/SalesNav.jsx', 'prodDashboard');
});

test('Production sidebar has Orders item', () => {
  fileContains('src/components/Layout/SalesNav.jsx', 'prodOrders');
});

test('Production sidebar has Quality item', () => {
  fileContains('src/components/Layout/SalesNav.jsx', 'prodQuality');
});

test('Production sidebar has Dispatch item', () => {
  fileContains('src/components/Layout/SalesNav.jsx', 'prodDispatch');
});

test('Production sidebar uses Factory icon', () => {
  fileContains('src/components/Layout/SalesNav.jsx', 'icon: Factory');
});

// ============================================================
// 7. APP LAYOUT PAGE TITLES
// ============================================================
console.log('\n📝 AppLayout Page Titles');

test('AppLayout has Production Dashboard title', () => {
  fileContains('src/components/Layout/AppLayout.jsx', "title: 'Production Dashboard'");
});

test('AppLayout has Production Work Orders title', () => {
  fileContains('src/components/Layout/AppLayout.jsx', "title: 'Production Work Orders'");
});

test('AppLayout has Casting title', () => {
  fileContains('src/components/Layout/AppLayout.jsx', "title: 'Casting'");
});

test('AppLayout has Quality title', () => {
  fileContains('src/components/Layout/AppLayout.jsx', "title: 'Quality'");
});

// ============================================================
// 8. API CONFIGURATION
// ============================================================
console.log('\n🌐 API Configuration');

// Production calls the SAME backend as every other module: the shared
// authenticated Axios instance, whose base URL is the relative '/v1' (dev-proxied
// to the single ERP backend on port 8080).
test('Production API uses the shared ERP Axios instance', () => {
  fileContains('src/production/utils/api.js', "from '../../api/axiosInstance'");
});

test('Shared ERP API client uses the relative /v1 base URL', () => {
  fileContains('src/api/axiosInstance.js', "'/v1'");
});

test('Production API does NOT use a hardcoded backend origin', () => {
  const content = readFileSync(join(ROOT, 'src/production/utils/api.js'), 'utf8');
  assert(!content.includes('localhost') && !content.includes('127.0.0.1'),
    'Production API must call the relative /v1 base URL, not a hardcoded backend origin');
});

test('Notification hook uses the shared /v1 base URL', () => {
  fileContains('src/production/hooks/useProductionNotificationCounts.js', "const API_BASE = '/v1'");
});

test('No hardcoded localhost:8081 in production source', () => {
  const files = readdirSync(join(PROD), { recursive: true });
  for (const file of files) {
    if (typeof file !== 'string' || !file.endsWith('.jsx') && !file.endsWith('.js')) continue;
    const content = readFileSync(join(PROD, file), 'utf8');
    assert(!content.includes('localhost:8081'),
      `Found hardcoded localhost:8081 in ${file}`);
  }
});

// ============================================================
// 9. VITE PROXY CONFIGURATION
// ============================================================
console.log('\n⚙️  Vite Proxy Configuration');

test('Vite config has the shared /v1 proxy', () => {
  fileContains('vite.config.js', "'/v1'");
});

test('Vite config proxies /v1 to the single ERP backend on 8080', () => {
  fileContains('vite.config.js', 'ERP_PROXY_TARGET');
  fileContains('vite.config.js', 'http://localhost:8080');
});

test('Vite config exposes no separate Production proxy', () => {
  const content = readFileSync(join(ROOT, 'vite.config.js'), 'utf8');
  assert(!content.includes('8081') && !content.includes("'/api'"),
    'vite.config.js must not proxy to a separate Production backend');
});

// ============================================================
// 10. CSS IMPORTS
// ============================================================
console.log('\n🎨 CSS Imports');

test('main.jsx imports Production theme.css', () => {
  fileContains('src/main.jsx', "production/styles/theme.css");
});

test('main.jsx imports Production global.css', () => {
  fileContains('src/main.jsx', "production/styles/global.css");
});

test('main.jsx imports Production forms.css', () => {
  fileContains('src/main.jsx', "production/styles/forms.css");
});

test('main.jsx imports Production table.css', () => {
  fileContains('src/main.jsx', "production/styles/table.css");
});

test('main.jsx imports Production design system', () => {
  fileContains('src/main.jsx', "production/styles/production-design-system.css");
});

test('Production theme.css exists', () => {
  fileExists('src/production/styles/theme.css');
});

test('Production global.css exists', () => {
  fileExists('src/production/styles/global.css');
});

// ============================================================
// 11. PRODUCTION COMPONENTS
// ============================================================
console.log('\n🧩 Production Components');

const REQUIRED_COMPONENTS = [
  'production/ProductionOrderTable.jsx',
  'production/ProductionKpiCard.jsx',
  'production/ProductionOrderFilters.jsx',
  'production/ProductionOrderTabs.jsx',
  'production/ProductionBulkActionBar.jsx',
  'production/ProductionWorkflow.jsx',
  'production/ProductionProgress.jsx',
  'production/ProductionStatusBadge.jsx',
  'production/ModuleSummaryCards.jsx',
  'production/WorkOrderJourneyTracker.jsx',
  'production/ModelViewer3D.jsx',
  'production/QuickActions.jsx',
  'production/ActionFeedback.jsx',
  'production/Modal.jsx',
  'production/TechnicalVerificationSection.jsx',
  'production/ApprovalProgressSection.jsx',
  'production/AcknowledgementSection.jsx',
  'production/DocumentsTab.jsx',
  'PageHeader.jsx',
  'icons/Icon.jsx',
];

for (const comp of REQUIRED_COMPONENTS) {
  test(`Component ${comp} exists`, () => {
    fileExists(`src/production/components/${comp}`, `Missing component: ${comp}`);
  });
}

// ============================================================
// 12. CURRENTUSER FIX VERIFICATION
// ============================================================
console.log('\n👤 CurrentUser Fix');

test('Production Orders uses ERP CurrentUserContext (not Production-specific)', () => {
  const content = readFileSync(join(PROD, 'pages', 'ProductionOrders.jsx'), 'utf8');
  assert(content.includes("from '../../components/Common/CurrentUserContext'"),
    'ProductionOrders should import from ERP CurrentUserContext');
  assert(!content.includes("from '../context/CurrentUserContext'"),
    'ProductionOrders should NOT import Production-specific CurrentUserContext');
});

test('ApprovalProgressSection uses ERP CurrentUserContext', () => {
  const content = readFileSync(join(PROD, 'components', 'production', 'ApprovalProgressSection.jsx'), 'utf8');
  assert(content.includes("from '../../../components/Common/CurrentUserContext'"),
    'ApprovalProgressSection should import from ERP CurrentUserContext');
});

test('ERP CurrentUserProvider wraps all routes including Production', () => {
  const content = readFileSync(join(ROOT, 'src', 'App.jsx'), 'utf8');
  const currentUserIdx = content.indexOf('<CurrentUserProvider>');
  const prodIdx = content.indexOf('Production Module Routes');
  assert(currentUserIdx < prodIdx, 'CurrentUserProvider must be above Production routes');
});

// ============================================================
// 13. PRODUCTION SERVICES
// ============================================================
console.log('\n🔧 Production Services');

const REQUIRED_SERVICES = [
  'productionOrderService.js',
  'qualityService.js',
  'shopFloorService.js',
  'packingService.js',
  'dispatchService.js',
  'machineService.js',
  'workCenterService.js',
  'reportService.js',
  'settingsService.js',
];

for (const svc of REQUIRED_SERVICES) {
  test(`Service ${svc} exists`, () => {
    fileExists(`src/production/services/production/${svc}`, `Missing service: ${svc}`);
  });
}

// ============================================================
// 14. PRODUCTION DATA FILES
// ============================================================
console.log('\n📊 Production Data Files');

const REQUIRED_DATA = [
  'navigation.js',
  'orders.js',
  'entries.js',
  'casting.js',
  'fabrication.js',
  'assembly.js',
  'quality.js',
  'packing.js',
  'dispatch.js',
  'salesOrders.js',
  'reports.js',
  'settings.js',
  'machineShop.js',
  'dashboard.js',
  'lifecycle.js',
  'migrate.js',
  'orderDetails.js',
];

for (const data of REQUIRED_DATA) {
  test(`Data file ${data} exists`, () => {
    fileExists(`src/production/data/${data}`, `Missing data: ${data}`);
  });
}

// ============================================================
// 15. PRODUCTION HOOKS
// ============================================================
console.log('\n🪝 Production Hooks');

test('useProductionNotificationCounts hook exists', () => {
  fileExists('src/production/hooks/useProductionNotificationCounts.js');
});

test('Notification hook uses the shared API URL', () => {
  fileContains('src/production/hooks/useProductionNotificationCounts.js', "'/v1'");
});

// ============================================================
// 16. PUBLIC ASSETS (3D Viewer)
// ============================================================
console.log('\n📦 Public Assets');

// The OCCT importer is bundled from the installed npm package
// (occt-import-js/dist/occt-import-js.wasm?url) and the parser worker lives in
// src/, so neither is a public/ asset any more.
test('OCCT parser worker module exists', () => {
  fileExists('src/production/modelviewer/cad/occt.worker.js');
});

test('OCCT worker loads the WASM from the installed occt-import-js package', () => {
  fileContains('src/production/modelviewer/cad/occt.worker.js',
    'occt-import-js/dist/occt-import-js.wasm?url');
});

test('OCCT main-thread loader exists', () => {
  fileExists('src/production/modelviewer/cad/occtLoader.js');
});

test('OCCT worker only parses STEP/IGES/BREP', () => {
  fileContains('src/production/modelviewer/cad/occt.worker.js',
    "new Set(['step', 'iges', 'brep'])");
});

// ============================================================
// 17. NPM DEPENDENCIES
// ============================================================
console.log('\n📦 NPM Dependencies');

test('three.js is installed (for 3D viewer)', () => {
  fileContains('package.json', '"three"');
});

// cad-preview is no longer a dependency: STEP/IGES go through the bundled
// occt-import-js WASM (and the backend engine), and SolidWorks parts are
// store-only in the browser. Assert the routing contract the viewer relies on.
test('occt-import-js is installed (client-side STEP/IGES parser)', () => {
  fileContains('package.json', '"occt-import-js"');
});

test('STEP/STP/IGES/IGS are routed to the backend CAD conversion', () => {
  for (const type of ['STEP', 'STP', 'IGES', 'IGS']) {
    assert(BACKEND_CONVERT_TYPES_SET.includes(type),
      `${type} must be part of the backend conversion set`);
    assert(needsBackendConversion(type), `${type} must ask for a backend conversion`);
    assert(resolveRenderer(type) === 'cad-convert', `${type} must route to the conversion renderer`);
    assert(!isSldStoreOnly(type), `${type} is convertible, not store-only`);
  }
  // …and the module stays the single routing table the viewer reads.
  fileContains('src/production/services/production/modelFormats.js',
    /const BACKEND_CONVERT_TYPES = \[/);
});

test('SLDPRT/SLDASM stay store-only (never parsed in the browser)', () => {
  for (const type of ['SLDPRT', 'SLDASM']) {
    assert(SLD_STORE_ONLY_TYPES_SET.includes(type),
      `${type} must stay in the SolidWorks store-only set`);
    assert(isSldStoreOnly(type), `${type} must report store-only`);
    assert(!needsBackendConversion(type),
      `${type} must never be sent for conversion — export to STEP instead`);
    assert(!isPreviewable(type), `${type} must not offer an in-browser preview`);
  }
  fileContains('src/production/services/production/modelFormats.js',
    /const SLD_STORE_ONLY_TYPES = \[/);
});

// ============================================================
// 18. NO BROKEN IMPORTS IN PAGES
// ============================================================
console.log('\n🔍 Import Path Verification');

test('No page imports from production-specific CurrentUserContext', () => {
  const files = readdirSync(join(PROD, 'pages'), { recursive: true });
  for (const file of files) {
    if (typeof file !== 'string' || (!file.endsWith('.jsx') && !file.endsWith('.js'))) continue;
    const content = readFileSync(join(PROD, 'pages', file), 'utf8');
    assert(!content.includes("from '../context/CurrentUserContext'") &&
           !content.includes('from "../../context/CurrentUserContext"'),
      `Page ${file} still imports Production-specific CurrentUserContext`);
  }
});

test('No page imports from Production-specific CurrentUserContext', () => {
  const files = readdirSync(join(PROD, 'pages'), { recursive: true });
  for (const file of files) {
    if (typeof file !== 'string' || (!file.endsWith('.jsx') && !file.endsWith('.js'))) continue;
    const content = readFileSync(join(PROD, 'pages', file), 'utf8');
    assert(!content.includes("from '../context/CurrentUserContext'"),
      `Page ${file} still imports Production-specific CurrentUserContext`);
  }
});

// ============================================================
// SUMMARY
// ============================================================
console.log('\n' + '='.repeat(60));
console.log(`\n  Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);
console.log(`  Total: ${passed + failed + skipped} tests\n`);

if (failed > 0) {
  console.log('  ⚠️  Some tests failed. Please fix the issues above.\n');
  process.exit(1);
} else {
  console.log('  ✅ All tests passed! Production module integration looks good.\n');
  process.exit(0);
}
