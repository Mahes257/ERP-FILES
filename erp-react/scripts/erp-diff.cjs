/** Diff ERP reference vs erp-react live structure per module. */
const fs = require('fs');
const ref = require('../evidence/erp-create-structure.json');
const live = require('../evidence/erp-react-live-structure.json');

const norm = (t) =>
  String(t)
    .toLowerCase()
    .replace(/[^a-z0-9/ ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const MODULES = Object.keys(ref);
for (const k of MODULES) {
  const r = ref[k] || {};
  const l = live[k] || {};
  if (r.error || l.error) { console.log(`## ${k}: SKIP (${r.error || l.error})`); continue; }
  const rLabels = (r.labels || []).map(norm).filter(Boolean);
  const lLabels = (l.labels || []).map(norm).filter(Boolean);
  const rSec = (r.sectionTitles || []).map(norm).filter(Boolean);
  const lSec = (l.sectionTitles || []).map(norm).filter(Boolean);
  const rThs = (r.ths || []).map(norm).filter(Boolean);
  const lThs = (l.ths || []).map(norm).filter(Boolean);

  const missingLabels = rLabels.filter((x) => !lLabels.includes(x));
  const extraLabels = lLabels.filter((x) => !rLabels.includes(x));
  const missingSec = rSec.filter((x) => !lSec.some((s) => s.includes(x) || x.includes(s)));
  const extraSec = lSec.filter((x) => !rSec.some((s) => s.includes(x) || x.includes(s)));
  const missingThs = rThs.filter((x) => !lThs.includes(x));
  const extraThs = lThs.filter((x) => !rThs.includes(x));

  console.log(`\n## ${k} (ref=${r.file || '?'}, route=${l.route || '?'})`);
  console.log(`  SECTIONS ref(${rSec.length}): ${rSec.join(' | ')}`);
  console.log(`  SECTIONS live(${lSec.length}): ${lSec.join(' | ')}`);
  console.log(`  MISSING labels (in ref, not live): ${missingLabels.join(' | ') || '(none)'}`);
  console.log(`  EXTRA labels (in live, not ref): ${extraLabels.join(' | ') || '(none)'}`);
  if (missingThs.length || extraThs.length) {
    console.log(`  THS missing: ${missingThs.join(' | ') || '(none)'}  | extra: ${extraThs.join(' | ') || '(none)'}`);
  }
  const rBtns = (r.buttons || []).map(norm).filter((x) => x.length > 1);
  const lBtns = (l.buttons || []).map(norm).filter((x) => x.length > 1);
  const missingBtns = rBtns.filter((x) => !lBtns.some((b) => b.includes(x) || x.includes(b)));
  const extraBtns = lBtns.filter((x) => !rBtns.some((b) => b.includes(x) || x.includes(b)));
  console.log(`  BUTTONS missing: ${missingBtns.join(' | ') || '(none)'}  | extra: ${extraBtns.join(' | ') || '(none)'}`);
}
