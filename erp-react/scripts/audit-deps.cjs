/**
 * scripts/audit-deps.cjs
 * ------------------------------------------------------------------
 * Read-only dependency usage audit.
 *
 * Scans every source file for module specifiers (static import, dynamic
 * import(), require(), side-effect import) and resolves the package name,
 * so a dependency is only reported as unused when NO runtime code imports it
 * — including subpath imports such as `three/examples/jsm/...` or
 * `leaflet/dist/leaflet.css`.
 *
 * Usage: node scripts/audit-deps.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const deps = Object.keys(pkg.dependencies || {});
const devDeps = Object.keys(pkg.devDependencies || {});

/** Roots that actually end up in the production bundle. */
const SRC_DIRS = ['src'];
const SRC_FILES = ['index.html', 'vite.config.js'];
/** Build/debug helpers that are NOT part of the app bundle. */
const NON_BUNDLED_DIRS = ['scripts'];

const SPECIFIER_RE = /(?:from\s*|import\s*\(\s*|require\s*\(\s*|^\s*import\s+)['"]([^'"]+)['"]/gm;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function collect(dir) {
  if (!fs.existsSync(dir)) return [];
  return walk(dir);
}

function packageName(spec) {
  if (!spec || spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('node:')) return null;
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

const bundledFiles = [...collect(path.join(ROOT, 'src')), ...SRC_FILES.map((f) => path.join(ROOT, f)).filter(fs.existsSync)];
const toolFiles = NON_BUNDLED_DIRS.flatMap((d) => collect(path.join(ROOT, d)));

const usage = new Map(); // pkg -> { bundled: Set, tools: Set }
for (const dep of [...deps, ...devDeps]) usage.set(dep, { bundled: new Set(), tools: new Set() });

function scan(files, bucket) {
  for (const file of files) {
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    SPECIFIER_RE.lastIndex = 0;
    let m;
    while ((m = SPECIFIER_RE.exec(text)) !== null) {
      const spec = m[1];
      const name = packageName(spec);
      if (!name) continue;
      const entry = usage.get(name);
      if (!entry) continue; // transitive/local alias, not a declared dep
      entry[bucket].add(path.relative(ROOT, file).replace(/\\/g, '/'));
    }
  }
}
scan(bundledFiles, 'bundled');
scan(toolFiles, 'tools');

const rel = (set) => [...set].sort();

console.log(`\n=== PRODUCTION DEPENDENCIES (${deps.length}) ===\n`);
const unusedInBundle = [];
for (const dep of deps) {
  const { bundled, tools } = usage.get(dep);
  const inBundle = rel(bundled);
  const inTools = rel(tools);
  if (inBundle.length === 0) {
    unusedInBundle.push({ dep, inTools });
    console.log(`UNUSED-IN-BUNDLE  ${dep.padEnd(24)} bundled=0  tool-only=${inTools.length}`);
  } else {
    console.log(`used              ${dep.padEnd(24)} bundled=${String(inBundle.length).padEnd(4)} files`);
  }
}

console.log('\n=== UNUSED IN BUNDLE — where (if anywhere) they are referenced ===');
for (const { dep, inTools } of unusedInBundle) {
  console.log(`\n${dep}`);
  if (inTools.length === 0) console.log('   no reference anywhere in src/ or scripts/');
  else inTools.slice(0, 5).forEach((f) => console.log('   tool: ' + f));
}

console.log('\n=== DEV DEPENDENCIES ===\n');
for (const dep of devDeps) {
  const { bundled, tools } = usage.get(dep);
  console.log(`${dep.padEnd(24)} bundled=${rel(bundled).length}  tools=${rel(tools).length}`);
}

console.log('\n=== PER-DEPENDENCY BUNDLED FILES (unused ones omitted) ===\n');
for (const dep of deps) {
  const files = rel(usage.get(dep).bundled);
  if (files.length === 0) continue;
  console.log(`${dep}:`);
  files.forEach((f) => console.log('   ' + f));
}
