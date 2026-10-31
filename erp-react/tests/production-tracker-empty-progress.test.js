/**
 * tests/production-tracker-empty-progress.test.js
 * ------------------------------------------------------------------
 * Sales → Customer Purchase Orders → Production Tracker: the six stage columns.
 *
 *   RULE      Casting / Fabrication / Assembly / QC / Packing / Dispatch show a
 *             progress bar and a percentage ONLY when the stage really has
 *             progress (> 0%). A stage with nothing recorded shows a plain "—",
 *             never an empty bar and never "0%"
 *   SAFE      a missing, null or non-numeric stage value cannot reach the UI as
 *             "0%" or "NaN%" — it normalises to the same dash
 *   UNCHANGED the overall percentage, the column set, the row set, the export
 *             and the detail panel keep exactly what they had
 *
 * Run: node --test tests/production-tracker-empty-progress.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const PAGE = 'src/pages/sales/CpoProductionTracker.jsx';
const page = readFileSync(join(root, PAGE), 'utf8');

/** The one stage cell the table renders for every row and every stage. */
const stageCell = () => {
  const start = page.indexOf('const pct = visibleStagePct(row[');
  assert.ok(start > 0, 'the table must render each stage cell through visibleStagePct');
  const end = page.indexOf('</td>', start);
  assert.ok(end > start, 'the stage cell must stay a table cell');
  return page.slice(start, end + 5);
};

/** The inline helper, evaluated so its contract is asserted by behaviour, not by text. */
const visibleStagePct = () => {
  const start = page.indexOf('const visibleStagePct = (value) => {');
  assert.ok(start > 0, 'the component must keep its visibleStagePct helper');
  const end = page.indexOf('\n};', start);
  return new Function(`${page.slice(start, end + 3)}; return visibleStagePct;`)();
};

/** Comments describe the rule; only the code may render it. */
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/** The two branches of the cell's conditional, comments removed. */
const branches = () => {
  const [before, after] = stageCell().split('pct > 0 ?');
  assert.ok(after, 'the stage cell must branch on pct > 0');
  assert.ok(before.includes('visibleStagePct'), 'the branch must read the normalised value');
  const [positive, empty] = after.split(') : (');
  assert.ok(empty, 'a stage without progress must have its own branch');
  return { positive: stripComments(positive), empty: stripComments(empty) };
};

describe('Production Tracker · the six stage columns show progress only when there is progress', () => {
  it('covers exactly the six production stages', () => {
    const stages = page.match(/const STAGES = \[[\s\S]*?\n\];/)[0];
    const keys = [...stages.matchAll(/key: '([a-z]+)'/g)].map((m) => m[1]);
    assert.deepEqual(keys, ['casting', 'fabrication', 'assembly', 'qc', 'packing', 'dispatch']);
  });

  it('renders the progress bar and the percentage only on the progress side', () => {
    const { positive, empty } = branches();

    assert.match(positive, /width: 40, height: 6/);
    assert.match(positive, /width: `\$\{pct\}%`/);
    assert.match(positive, /\{pct\}%/);
    assert.match(positive, /pct === 100 \? '#059669' : s\.color/);

    assert.doesNotMatch(empty, /height: 6/, 'no bar may be rendered without progress');
    assert.doesNotMatch(empty, /\{pct\}%/, 'no percentage may be rendered without progress');
  });

  it('shows a dash, and only a dash, when the stage has no progress', () => {
    const { empty } = branches();
    assert.match(empty, />—</);
    assert.match(empty, /color: '#9CA3AF'/);
    assert.doesNotMatch(empty, /0%/, 'the empty stage must not print 0%');
  });

  it('no longer paints a zero-progress bar', () => {
    assert.doesNotMatch(stageCell(), /#d1d5db/);
  });

  it('keeps one column per stage, so nothing is hidden or merged away', () => {
    assert.match(stageCell(), /<td key=\{s\.key\}/);
    assert.equal(
      (page.match(/<td key=\{s\.key\}/g) || []).length,
      1,
      'the stages must be rendered by one table cell, one per column'
    );
  });
});

describe('Production Tracker · the stage percentage normalises instead of rendering NaN%', () => {
  const pct = visibleStagePct();

  it('passes real progress through, unchanged', () => {
    assert.equal(pct(80), 80);
    assert.equal(pct(33), 33);
    assert.equal(pct(100), 100);
    assert.equal(pct(1), 1);
  });

  it('treats no progress as nothing to show', () => {
    assert.equal(pct(0), 0);
    assert.equal(pct(-5), 0);
    assert.equal(pct(undefined), 0);
    assert.equal(pct(null), 0);
    assert.equal(pct(''), 0);
  });

  it('never returns NaN, even for junk', () => {
    for (const value of [NaN, 'abc', {}, [], Infinity, -Infinity]) {
      const result = pct(value);
      assert.equal(Number.isFinite(result), true, `${String(value)} must not produce ${result}`);
      assert.equal(result, 0);
    }
  });
});

describe('Production Tracker · everything else is untouched', () => {
  it('keeps the overall progress cell exactly as it was', () => {
    assert.match(page, /width: 50, height: 8/);
    assert.match(page, /width: `\$\{row\.progress \|\| 0\}%`/);
    assert.match(page, /\{row\.progress \|\| 0\}%/);
    // the overall cell never goes through the stage rule
    assert.doesNotMatch(page, /visibleStagePct\(row\.progress\)/);
  });

  it('keeps the stage filter, the CSV export values and the detail panel as they were', () => {
    assert.match(page, /row\[`\$\{stageFilter\.toLowerCase\(\)\}Pct`\] \|\| 0/);
    assert.match(page, /'Overall Progress': `\$\{row\.progress \|\| 0\}%`/);
    assert.match(page, /Casting: `\$\{row\.castingPct \|\| 0\}%`/);
    // the detail panel's own stage grid is a separate, untouched rendering
    assert.match(page, /Stage Progress/);
  });

  it('still reads every stage column from its own field', () => {
    for (const key of ['casting', 'fabrication', 'assembly', 'qc', 'packing', 'dispatch']) {
      assert.match(page, new RegExp(`${key}Pct`), `the ${key} column must still read its own value`);
    }
  });
});
