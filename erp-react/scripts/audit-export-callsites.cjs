/**
 * scripts/audit-export-callsites.cjs
 * ------------------------------------------------------------------
 * Read-only check: every purchase exportExcel() call site must sit in an
 * async function with a try/catch, so making exportExcel() load SheetJS
 * lazily (i.e. return a promise) cannot silently swallow a failure or
 * introduce a syntax error.
 *
 * Usage: node scripts/audit-export-callsites.cjs
 */
const fs = require('fs');
const path = require('path');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(js|jsx)$/.test(entry.name) && !/\.test\.js$/.test(entry.name)) out.push(full);
  }
  return out;
}

const files = walk(path.resolve(__dirname, '..', 'src'));
let ok = 0;
const review = [];

for (const file of files) {
  const rel = path.relative(path.resolve(__dirname, '..'), file).split(path.sep).join('/');
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((text, i) => {
    if (!/exportExcel\(/.test(text)) return;
    if (/export\s+(async\s+)?function\s+exportExcel/.test(text)) return;
    if (/^\s*import\s/.test(text)) return;

    const before = lines.slice(Math.max(0, i - 30), i).join('\n');
    const after = lines.slice(i, i + 30).join('\n');
    const hasTry = /try\s*\{/.test(before);
    const hasCatch = /catch\s*[({]/.test(after);
    const enclosing = lines.slice(0, i).reverse().find((l) => /(async\s*\(|async\s+function|=>\s*\{|= async|function\s)/.test(l));
    const isAsync = /async/.test(enclosing || '');

    if (hasTry && hasCatch && isAsync) ok += 1;
    else review.push({ rel, line: i + 1, hasTry, hasCatch, isAsync, enclosing: (enclosing || '').trim().slice(0, 80) });
  });
}

console.log(`call sites inside an async function with try/catch: ${ok}`);
console.log(`needs review: ${review.length}`);
review.forEach((r) => {
  console.log(`   ${r.rel}:${r.line}  try=${r.hasTry} catch=${r.hasCatch} async=${r.isAsync}  | ${r.enclosing}`);
});
