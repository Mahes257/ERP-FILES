/**
 * scripts/gen-route-prefetch.cjs
 * ------------------------------------------------------------------
 * Regenerates src/utils/routePrefetch.generated.js.
 *
 *   node scripts/gen-route-prefetch.cjs
 *
 * The generated file maps every static route path to the SAME lazy
 * import thunk the router declares for it, so hovering a navigation
 * item can warm the exact module chunk the router will request when
 * the click lands. Routes are read from the three places that declare
 * them:
 *
 *   src/App.jsx                                 → top-level app routes
 *   src/purchase/routes/purchaseRoutes.jsx      → mounted at /purchase
 *   src/production/routes/productionRoutes.jsx  → mounted at /production
 *
 * Only the generated file is written; nothing else is touched.
 * ------------------------------------------------------------------
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const SOURCES = [
  {
    // specifiers in App.jsx are relative to src/, the generated file lives in src/utils/
    file: 'src/App.jsx',
    mount: '',
    rewrite: (spec) => spec.replace(/^\.\//, '../'),
  },
  {
    // specifiers in purchaseRoutes.jsx are relative to src/purchase/routes/
    file: 'src/purchase/routes/purchaseRoutes.jsx',
    mount: 'purchase',
    rewrite: (spec) => `../purchase/${spec.replace(/^\.\.\//, '')}`,
  },
  {
    file: 'src/production/routes/productionRoutes.jsx',
    mount: 'production',
    rewrite: (spec) => `../production/${spec.replace(/^\.\.\//, '')}`,
  },
];

/** Collect `const X = lazy(() => import('...'))` declarations. */
function collectLazyDeclarations(source) {
  const decls = new Map();
  const re = /const\s+([A-Za-z0-9_$]+)\s*=\s*lazy\(\(\)\s*=>\s*import\('([^']+)'\)/g;
  let match;
  while ((match = re.exec(source))) decls.set(match[1], match[2]);
  return decls;
}

/** Collect `path` → lazy component name from static <Route /> elements. */
function collectRouteElements(source) {
  const routes = [];
  const re = /<Route\s+([^>]*?)\/>/g;
  let match;
  while ((match = re.exec(source))) {
    const tag = match[1];
    const routePath = (tag.match(/path="([^"]+)"/) || [])[1];
    const element = (tag.match(/element=\{<([A-Za-z0-9_$]+)/) || [])[1];
    if (!routePath || !element) continue;
    routes.push({ routePath, element });
  }
  return routes;
}

function build() {
  const modules = new Map();
  const containers = new Map();

  for (const source of SOURCES) {
    const file = path.join(ROOT, source.file);
    const text = fs.readFileSync(file, 'utf8');
    const decls = collectLazyDeclarations(text);

    for (const { routePath, element } of collectRouteElements(text)) {
      const specifier = decls.get(element);
      if (!specifier) continue;
      // Dynamic routes (`/leads/:id`) are reached from a list row, never from
      // a navigation item, so they are not worth warming.
      if (routePath.includes(':')) continue;

      const isContainer = routePath.endsWith('/*');
      const bare = routePath.replace(/\/\*$/, '');
      const full = bare.startsWith('/')
        ? bare
        : `/${source.mount}/${bare}`.replace(/\/+/g, '/');

      const target = isContainer ? containers : modules;
      if (!target.has(full)) target.set(full, source.rewrite(specifier));
    }
  }

  const lines = [];
  lines.push('/**');
  lines.push(' * GENERATED FILE — do not edit by hand.');
  lines.push(' * Regenerate with: node scripts/gen-route-prefetch.cjs');
  lines.push(' *');
  lines.push(' * Every entry mirrors a route declared in src/App.jsx,');
  lines.push(' * src/purchase/routes/purchaseRoutes.jsx or');
  lines.push(' * src/production/routes/productionRoutes.jsx — the thunks resolve to');
  lines.push(' * the same modules, so a prefetch can never download a second copy of');
  lines.push(' * a chunk the router already owns.');
  lines.push(' */');
  lines.push('');

  lines.push('/** Route path → lazy import thunk. */');
  lines.push('export const ROUTE_MODULES = {');
  for (const [routePath, specifier] of [...modules.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`  '${routePath}': () => import('${specifier}'),`);
  }
  lines.push('};');
  lines.push('');

  lines.push('/** Module root → lazy import thunk for the module route table itself. */');
  lines.push('export const MODULE_CONTAINERS = {');
  for (const [routePath, specifier] of [...containers.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const name = routePath.replace(/^\//, '').replace(/\//g, '_');
    lines.push(`  '${name}': () => import('${specifier}'),`);
  }
  lines.push('};');
  lines.push('');

  const out = path.join(ROOT, 'src/utils/routePrefetch.generated.js');
  fs.writeFileSync(out, lines.join('\n'), 'utf8');
  process.stdout.write(
    `wrote ${path.relative(ROOT, out)} — ${modules.size} routes, ${containers.size} module containers\n`,
  );
}

build();
