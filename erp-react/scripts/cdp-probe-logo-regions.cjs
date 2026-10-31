/*
 * FINER LOGO ANALYSIS — locate the emblem region (left) vs wordmark (right).
 * Usage: node cdp-driver.cjs 9222 scripts/cdp-probe-logo-regions.cjs
 */
const fs = require('fs');
const BASE64 = fs.readFileSync(process.env.LOGO_PATH || 'src/assets/vishak-tech-logo.png').toString('base64');

module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { evalJs } = helpers;
    await cdp.send('Runtime.enable');
    const expr = `(async () => {
      const img = new Image();
      img.src = 'data:image/jpeg;base64,${BASE64}';
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const { width, height } = c;
      const d = ctx.getImageData(0, 0, width, height).data;
      const px = (x, y) => { const i = (y * width + x) * 4; return [d[i], d[i+1], d[i+2]]; };
      const bg = [0, 57, 48];
      const diff = (p) => Math.abs(p[0]-bg[0]) + Math.abs(p[1]-bg[1]) + Math.abs(p[2]-bg[2]);
      const isInk = (x, y) => diff(px(x, y)) > 40;

      // Column ink profile every 8px
      const cols = [];
      for (let x = 0; x < width; x += 8) {
        let ink = 0;
        for (let y = 0; y < height; y += 4) if (isInk(x, y)) ink++;
        cols.push({ x, ink });
      }
      // find widest internal gap in content
      const inkCols = cols.filter((cl) => cl.ink > 0);
      let gapStart = null, bestGap = { start: 0, end: 0, w: 0 };
      for (let i = 1; i < inkCols.length; i++) {
        const gap = inkCols[i].x - (inkCols[i-1].x + 8);
        if (gap > 60 && gap > bestGap.w) bestGap = { start: inkCols[i-1].x + 8, end: inkCols[i].x, w: gap };
      }
      // dominant colours in left content (before gap) vs right
      const colorSample = (x0, x1, step) => {
        const buckets = {};
        for (let x = x0; x < x1; x += step) for (let y = 0; y < height; y += step) {
          if (isInk(x, y)) {
            const p = px(x, y);
            const k = (p[0] >> 4) + ',' + (p[1] >> 4) + ',' + (p[2] >> 4);
            buckets[k] = (buckets[k] || 0) + 1;
          }
        }
        return Object.entries(buckets).sort((a, b) => b[1] - a[1]).slice(0, 8)
          .map(([k, n]) => ({ rgb: k, n }));
      };
      const emblemCols = inkCols.filter((cl) => bestGap.w ? cl.x < bestGap.start : cl.x < width * 0.45);
      const wordmarkCols = inkCols.filter((cl) => bestGap.w ? cl.x > bestGap.end : cl.x >= width * 0.45);
      return {
        width, height,
        firstInk: inkCols[0].x, lastInk: inkCols[inkCols.length - 1].x,
        gap: bestGap,
        emblemSpan: emblemCols.length ? [emblemCols[0].x, emblemCols[emblemCols.length - 1].x] : null,
        wordmarkSpan: wordmarkCols.length ? [wordmarkCols[0].x, wordmarkCols[wordmarkCols.length - 1].x] : null,
        emblemColors: colorSample(emblemCols[0]?.x || 0, bestGap.w ? bestGap.start : width * 0.45, 8),
        wordmarkColors: colorSample(bestGap.w ? bestGap.end : width * 0.45, width, 8)
      };
    })()`;
    const r = await evalJs(expr);
    console.log(JSON.stringify(r, null, 1));
    console.log('CDP_SCRIPT_DONE');
  }
};