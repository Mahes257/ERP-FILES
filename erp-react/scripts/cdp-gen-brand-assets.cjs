/*
 * GENERATE VH BRAND ASSETS from the official logo (analysis-in/browser-in).
 * Usage: node cdp-driver.cjs 9222 scripts/cdp-gen-brand-assets.cjs
 *
 * Loads the official logo JPEG, then:
 *  1. full transparent lockup  -> src/assets/vishak-tech-logo.png
 *  2. opaque plate (trimmed)   -> src/assets/vishak-tech-logo-plate.png
 *  3. emblem (square, transp.) -> src/assets/vishak-tech-emblem.png
 *                                 public/vishak-tech-favicon.png
 *  4. writes src/constants/companyBrand.js (data-URI exports used by print/PDF)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LOGO = process.env.LOGO_PATH || 'src/assets/vishak-tech-logo.png';
const BASE64 = fs.readFileSync(LOGO).toString('base64');

// Content bbox measured from the logo: emblem 88..305 x 144..368, wordmark
// 375..1218 x 207..372 => union clip ~ x88..1218 y144..372 (+ margins)
const FULL = { x0: 72, y0: 128, x1: 1234, y1: 388 };     // 1162 x 260
const EMB  = { x0: 76, y0: 136, x1: 316, y1: 376 };      // 240 x 240 (emblem square)
const BG   = [0, 57, 48];
const TOL  = 30;

module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { evalJs } = helpers;
    await cdp.send('Runtime.enable');

    const genExpr = (crop, transparent) => `(async () => {
      const img = new Image();
      img.src = 'data:image/jpeg;base64,${BASE64}';
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
      const { x0, y0, x1, y1 } = ${JSON.stringify(crop)};
      const c = document.createElement('canvas');
      c.width = x1 - x0; c.height = y1 - y0;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, x0, y0, c.width, c.height, 0, 0, c.width, c.height);
      if (${transparent}) {
        const d = ctx.getImageData(0, 0, c.width, c.height);
        const p = d.data;
        let rem = 0, total = 0;
        for (let i = 0; i < p.length; i += 4) {
          total++;
          if (Math.abs(p[i] - ${BG[0]}) <= ${TOL} && Math.abs(p[i+1] - ${BG[1]}) <= ${TOL} && Math.abs(p[i+2] - ${BG[2]}) <= ${TOL}) {
            p[i+3] = 0;
          } else rem++;
        }
        ctx.putImageData(d, 0, 0);
        window.__genStats = { total, kept: rem, removed: total - rem };
      }
      const uri = c.toDataURL('image/png');
      return { w: c.width, h: c.height, len: uri.length, uri };
    })()`;

    const uris = {};
    for (const key of ['full', 'plate']) {
      const r = await evalJs(genExpr(FULL, key === 'full'));
      console.log(`${key}: ${r.w}x${r.h} bytes=${(r.len * 0.75 / 1024).toFixed(1)}KB`);
      if (key === 'full') {
        const s = await evalJs(`window.__genStats`);
        console.log('full bg-removal:', JSON.stringify(s));
        fs.writeFileSync(path.join(ROOT, 'src', 'assets', 'vishak-tech-logo.png'), Buffer.from(r.uri.split(',')[1], 'base64'));
      } else {
        fs.writeFileSync(path.join(ROOT, 'src', 'assets', 'vishak-tech-logo-plate.png'), Buffer.from(r.uri.split(',')[1], 'base64'));
      }
      uris[key] = r.uri;
    }

    const e = await evalJs(genExpr(EMB, true));
    console.log(`emblem: ${e.w}x${e.h} bytes=${(e.len * 0.75 / 1024).toFixed(1)}KB`);
    fs.writeFileSync(path.join(ROOT, 'src', 'assets', 'vishak-tech-emblem.png'), Buffer.from(e.uri.split(',')[1], 'base64'));
    fs.writeFileSync(path.join(ROOT, 'public', 'vishak-tech-favicon.png'), Buffer.from(e.uri.split(',')[1], 'base64'));
    uris.emblem = e.uri;

    // companyBrand constants module (single data-URI source used by print/PDF + components)
    const modulePath = path.join(ROOT, 'src', 'constants');
    fs.mkdirSync(modulePath, { recursive: true });
    const moduleContent = `// Generated from the official Vishak Tech logo asset — do not edit by hand.
// Run scripts/cdp-gen-brand-assets.cjs to regenerate.
export const VH_LOGO_URI = ${JSON.stringify(uris.full)};
export const VH_LOGO_PLATE_URI = ${JSON.stringify(uris.plate)};
export const VH_EMBLEM_URI = ${JSON.stringify(uris.emblem)};
`;
    fs.writeFileSync(path.join(modulePath, 'companyBrand.js'), moduleContent);
    console.log('wrote src/constants/companyBrand.js + assets');
    console.log('CDP_SCRIPT_DONE');
  }
};