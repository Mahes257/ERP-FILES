/*
 * HIGH-RES ASCII of the two logo regions (emblem left, wordmark right).
 * Usage: node cdp-driver.cjs 9222 scripts/cdp-probe-logo-ascii2.cjs
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
      const bg = [0, 57, 48];
      const render = (x0, y0, x1, y1, cols, rows) => {
        const cwpx = (x1 - x0) / cols, chpx = (y1 - y0) / rows;
        let out = '';
        for (let ry = 0; ry < rows; ry++) {
          let line = '';
          for (let rx = 0; rx < cols; rx++) {
            let ink = 0, r = 0, g = 0, b = 0;
            for (let y = Math.floor(y0 + ry * chpx); y < Math.floor(y0 + (ry + 1) * chpx); y++) {
              for (let x = Math.floor(x0 + rx * cwpx); x < Math.floor(x0 + (rx + 1) * cwpx); x++) {
                const i = (y * width + x) * 4;
                if (Math.abs(d[i]-bg[0]) < 22 && Math.abs(d[i+1]-bg[1]) < 22 && Math.abs(d[i+2]-bg[2]) < 22) continue;
                ink++; r += d[i]; g += d[i+1]; b += d[i+2];
              }
            }
            if (ink === 0) { line += ' '; continue; }
            const ar = r / ink, ag = g / ink, ab = b / ink;
            const mLum = 0.2126 * ar + 0.7152 * ag + 0.0722 * ab;
            let glyph;
            if (mLum < 90) glyph = '#';
            else if (ag > ar + 25 && ag > ab + 25) glyph = 'G';
            else if (ar > 150 && ag > 100 && ab < 90) glyph = 'A';
            else if (mLum > 200) glyph = 'W';
            else if (ar > 120 && ag < 100 && ab < 100) glyph = 'R';
            else if (mLum > 150) glyph = 'w';
            else glyph = 'o';
            line += glyph;
          }
          out += '│' + line + '│\\n';
        }
        return out;
      };
      return '=== EMBLEM (x90-330, y130-390) ===\\n' + render(90, 130, 330, 390, 48, 22) +
             '\\n=== WORDMARK (x370-1240, y110-400) ===\\n' + render(370, 110, 1240, 400, 100, 26);
    })()`;
    const r = await evalJs(expr);
    console.log(r);
    console.log('CDP_SCRIPT_DONE');
  }
};