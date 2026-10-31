/**
 * scripts/audit-heavy-imports.cjs
 * ------------------------------------------------------------------
 * Read-only audit of how each HEAVY library is imported.
 *
 * A top-level `import ... from 'lib'` makes the library part of the module
 * graph of whatever route imports the file, so every visit to that route
 * downloads the library even if the user never exports/prints/views.
 * `await import('lib')` inside the function that needs it keeps the library
 * in its own chunk, fetched only on demand.
 *
 * Usage: node scripts/audit-heavy-imports.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HEAVY = [
  'xlsx',
  'jspdf',
  'jspdf-autotable',
  'html2canvas-pro',
  'pdf-lib',
  'jszip',
  'leaflet',
  'react-leaflet',
  'three',
  '@stomp/stompjs'
];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(js|jsx)$/.test(entry.name) && !/\.test\.js$/.test(entry.name)) out.push(full);
  }
  return out;
}

const files = walk(path.join(ROOT, 'src'));
const staticUses = new Map(); // lib -> [{file, line, text}]
const dynamicUses = new Map();
for (const lib of HEAVY) {
  staticUses.set(lib, []);
  dynamicUses.set(lib, []);
}

for (const file of files) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((text, i) => {
    for (const lib of HEAVY) {
      const specRe = new RegExp(`['"]${lib.replace(/[/@]/g, (c) => '\\' + c)}(/[^'"]*)?['"]`);
      if (!specRe.test(text)) continue;
      const isStatic = /^\s*import\s/.test(text) || /^\s*export\s/.test(text);
      const isDynamic = /import\s*\(/.test(text) || /require\s*\(/.test(text);
      if (isDynamic) dynamicUses.get(lib).push({ file: rel, line: i + 1 });
      else if (isStatic) staticUses.get(lib).push({ file: rel, line: i + 1, text: text.trim() });
    }
  });
}

let offenders = 0;
console.log('\n=== STATIC (eager) imports of heavy libraries ===\n');
for (const lib of HEAVY) {
  const s = staticUses.get(lib);
  const d = dynamicUses.get(lib);
  if (s.length === 0 && d.length === 0) {
    console.log(`${lib.padEnd(20)} not imported at all`);
    continue;
  }
  console.log(`${lib.padEnd(20)} static=${String(s.length).padEnd(3)} dynamic=${d.length}`);
  s.forEach((u) => {
    offenders += 1;
    console.log(`    EAGER  ${u.file}:${u.line}`);
    console.log(`           ${u.text}`);
  });
}

console.log(`\n${offenders} eager heavy import(s) found.`);
