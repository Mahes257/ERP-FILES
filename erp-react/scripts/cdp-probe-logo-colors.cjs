/*
 * PRECISE color stats + emblem/wordmark bounds.
 * Usage: node cdp-driver.cjs 9222 scripts/cdp-probe-logo-colors.cjs
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
      const isBg = (x, y) => { const i = (y*width+x)*4; return Math.abs(d[i]-bg[0])<22 && Math.abs(d[i+1]-bg[1])<22 && Math.abs(d[i+2]-bg[2])<22; };
      const avg = (x0,y0,x1,y1,step) => {
        let ink=0,r=0,g=0,b=0;
        for (let y=y0;y<y1;y+=step) for (let x=x0;x<x1;x+=step) {
          if (isBg(x,y)) continue; ink++;
          const i=(y*width+x)*4; r+=d[i]; g+=d[i+1]; b+=d[i+2];
        }
        return ink ? [Math.round(r/ink),Math.round(g/ink),Math.round(b/ink),ink] : null;
      };
      const bbox = (x0,y0,x1,y1) => {
        let minX=x1,maxX=x0,minY=y1,maxY=y0;
        for (let y=y0;y<y1;y++) for (let x=x0;x<x1;x++) if (!isBg(x,y)) { if(x<minX)minX=x; if(x>maxX)maxX=x; if(y<minY)minY=y; if(y>maxY)maxY=y; }
        return minX<=maxX ? {minX,maxX,minY,maxY,w:maxX-minX+1,h:maxY-minY+1} : null;
      };
      return {
        emblemBbox: bbox(80, 120, 340, 400),
        wordmarkBbox: bbox(360, 90, 1250, 420),
        wordmarkAvg: avg(370, 110, 1240, 400, 3),
        emblemAvg: avg(100, 140, 320, 380, 3),
        emblemCenterSample: avg(170, 200, 250, 300, 2),
        corner: isBg(0,0) ? 'corner-is-bg' : JSON.stringify({0:d[0],1:d[1],2:d[2]})
      };
    })()`;
    const r = await evalJs(expr);
    console.log(JSON.stringify(r, null, 1));
    console.log('CDP_SCRIPT_DONE');
  }
};