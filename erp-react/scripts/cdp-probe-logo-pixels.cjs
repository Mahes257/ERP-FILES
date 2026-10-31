/*
 * PIXEL-PROBE THE OFFICIAL VISHAK TECH LOGO (analysis only).
 * Usage: node cdp-driver.cjs 9222 scripts/cdp-probe-logo-pixels.cjs
 * Loads the logo as a data-URL image, draws to canvas and reports:
 *  - background colour at corners/edges (is it white / uniform?)
 *  - overall content bounding box (non-background pixels)
 *  - horizontal distribution to locate emblem vs wordmark
 *  - dark vs light pixel ratio (to judge how the wordmark reads)
 */
const fs = require('fs');
const BASE64 = fs.readFileSync(process.env.LOGO_PATH || 'src/assets/vishak-tech-logo.png').toString('base64');

module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { evalJs } = helpers;
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');

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
      const px = (x, y) => {
        const i = (y * width + x) * 4;
        return [d[i], d[i + 1], d[i + 2], d[i + 3]];
      };
      const same = (a, b, t) => Math.abs(a[0]-b[0]) <= t && Math.abs(a[1]-b[1]) <= t && Math.abs(a[2]-b[2]) <= t;

      // Corners + edge midpoints
      const corners = {
        tl: px(0, 0), tr: px(width - 1, 0), bl: px(0, height - 1), br: px(width - 1, height - 1),
        tm: px((width/2)|0, 0), bm: px((width/2)|0, height - 1), ml: px(0, (height/2)|0), mr: px(width - 1, (height/2)|0)
      };
      const bg = corners.tl;
      const isWhite = bg[0] > 240 && bg[1] > 240 && bg[2] > 240;
      const isUniform = Object.values(corners).every((p) => same(p, bg, 12));

      // Bounding box of non-background content
      let minX = width, maxX = -1, minY = height, maxY = -1;
      for (let y = 0; y < height; y += 2) {
        for (let x = 0; x < width; x += 2) {
          if (!same(px(x, y), bg, 28)) {
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
          }
        }
      }

      // Column profile: how many non-bg pixels per 1/16th column band + mean darkness
      const bands = [];
      const bandCount = 16;
      for (let b = 0; b < bandCount; b++) {
        const x0 = (width * b) / bandCount | 0, x1 = (width * (b + 1)) / bandCount | 0;
        let ink = 0, sampled = 0, lumSum = 0;
        for (let x = x0; x < x1; x += 2) {
          for (let y = 0; y < height; y += 2) {
            const p = px(x, y);
            if (!same(p, bg, 28)) {
              ink++;
              lumSum += 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
            }
            sampled++;
          }
        }
        bands.push({ b, inkPct: +(ink / sampled * 100).toFixed(1), meanLum: +(lumSum / Math.max(ink, 1)).toFixed(1) });
      }

      // Dark pixel ratio (wordmark is usually dark) vs bright/coloured pixels (emblem)
      let darkPixels = 0, brightPixels = 0, contentPixels = 0;
      for (let y = 0; y < height; y += 2) {
        for (let x = 0; x < width; x += 2) {
          const p = px(x, y);
          if (!same(p, bg, 28)) {
            contentPixels++;
            const lum = 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
            if (lum < 110) darkPixels++;
            if (lum > 200) brightPixels++;
          }
        }
      }

      return {
        width, height, bg, isWhite, isUniform,
        contentBox: { minX, maxX, minY, maxY, w: maxX - minX + 1, h: maxY - minY + 1 },
        bands,
        darkPct: +(darkPixels / Math.max(contentPixels, 1) * 100).toFixed(1),
        brightPct: +(brightPixels / Math.max(contentPixels, 1) * 100).toFixed(1)
      };
    })()`;
    const r = await evalJs(expr);
    console.log(JSON.stringify(r, null, 1));
    console.log('CDP_SCRIPT_DONE');
  }
};