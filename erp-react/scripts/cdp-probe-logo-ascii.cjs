/*
 * ASCII VISUALIZATION of the logo (luminance + hue) so layout can be read
 * without image input. Renders ~64x26 char grid.
 * Usage: node cdp-driver.cjs 9222 scripts/cdp-probe-logo-ascii.cjs
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
      const isBg = (x, y) => {
        const i = (y * width + x) * 4;
        return Math.abs(d[i]-bg[0]) < 22 && Math.abs(d[i+1]-bg[1]) < 22 && Math.abs(d[i+2]-bg[2]) < 22;
      };
      const cols = 64, rows = 26;
      const cw = width / cols, ch = height / rows;
      let out = '';
      for (let ry = 0; ry < rows; ry++) {
        let line = '';
        for (let rx = 0; rx < cols; rx++) {
          let ink = 0, lum = 0, r = 0, g = 0, b = 0;
          for (let y = Math.floor(ry * ch); y < Math.floor((ry + 1) * ch); y += 2) {
            for (let x = Math.floor(rx * cw); x < Math.floor((rx + 1) * cw); x += 2) {
              if (!isBg(x, y)) { ink++; const i = (y * width + x) * 4; r += d[i]; g += d[i+1]; b += d[i+2]; }
            }
          }
          if (ink === 0) { line += ' '; continue; }
          lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          // classify hue: greenish, goldish, whitish, dark
          const avgR = r / ink, avgG = g / ink, avgB = b / ink;
          const mLum = 0.2126 * avgR + 0.7152 * avgG + 0.0722 * avgB;
          let ch2;
          if (mLum < 90) ch2 = '#';
          else if (avgG > avgR + 25 && avgG > avgB + 25) ch2 = 'G';   // green
          else if (avgR > 150 && avgG > 100 && avgB < 90) ch2 = 'A';  // gold/amber
          else if (avgR > 200 && avgG > 190 && avgB > 150) ch2 = 'w'; // white/warm white
          else if (mLum > 200) ch2 = 'W';
          else if (avgR > avgB && avgR > avgG) ch2 = 'R';
          else ch2 = 'o';
          line += ch2;
        }
        out += line + '\\n';
      }
      return out;
    })()`;
    const r = await evalJs(expr);
    console.log(r);
    console.log('CDP_SCRIPT_DONE');
  }
};