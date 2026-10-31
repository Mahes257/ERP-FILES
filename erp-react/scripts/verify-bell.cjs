/* Gold bell count readability verification.
 * 1) Live sidebar bells: font-size/weight/color, count rect fully inside the
 *    bell svg, aria-label carries the same count.
 * 2) Geometry testbed for exact slots: 6 / 14 / 16 / 30 / 99 / 99+ must render
 *    fully inside the bell body with the required centering and font sizes. */
const fs = require('fs');
const path = require('path');
const results = [];
const ok = (k, pass, msg = '') => results.push({ k, pass, msg });

const BELL_SVG = `<svg class="sb-bell-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
<defs><linearGradient id="sbBellGoldT" x1="0" y1="0" x2="0" y2="1">
<stop offset="0%" stop-color="#fcd34d"/><stop offset="45%" stop-color="#fbbf24"/><stop offset="100%" stop-color="#d97706"/>
</linearGradient></defs>
<ellipse cx="12" cy="2.1" rx="1.9" ry="1.3" fill="#fbbf24" stroke="#a16207" stroke-width="0.7"/>
<path d="M12 4.5 C7.4 4.5 5.8 7.6 5.8 10.2 C5.8 11.7 5.4 12.7 5.2 13.6 L5.1 15 C5 15.9 6.1 16.3 6.8 16.1 L17.2 16.1 C17.9 16.3 19 15.9 18.9 15 L18.8 13.6 C18.6 12.7 18.2 11.7 18.2 10.2 C18.2 7.6 16.6 4.5 12 4.5 Z" fill="url(#sbBellGoldT)" stroke="#a16207" stroke-width="1"/>
<ellipse cx="12" cy="17.1" rx="6.6" ry="1.8" fill="#f59e0b" stroke="#a16207" stroke-width="0.9"/>
<circle cx="12" cy="21.7" r="1.3" fill="#b45309"/>
</svg>`;

module.exports.run = async ({ cdp, sleep, helpers }) => {
  const { evalJs, navigate, waitFor, shot } = helpers;
  await shot('bell-01-before'); // baseline (whatever was on screen)

  await navigate('http://localhost:5173/signin');
  await evalJs(`(() => {
    const set = (sel, v) => {
      const el = document.querySelector(sel);
      if (!el) return;
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    set('input[type="email"]', 'admin@vishaktech.com');
    set('input[type="password"]', 'Admin@123');
    const btn = document.querySelector('button[type="submit"]');
    if (btn) btn.click();
  })()`);
  await waitFor("document.querySelector('.app-sidebar')", 25000);
  await sleep(3000);

  // 1) Live sidebar bells
  const live = await evalJs(`(() => {
    const bells = [...document.querySelectorAll('.app-sidebar .sb-bell')];
    return bells.map((b) => {
      const svg = b.querySelector('.sb-bell-svg');
      const c = b.querySelector('.sb-bell-count');
      const cs = getComputedStyle(c);
      const sr = svg.getBoundingClientRect();
      const cr = c.getBoundingClientRect();
      return {
        text: c.textContent.trim(),
        fontSize: cs.fontSize,
        weight: cs.fontWeight,
        color: cs.color,
        fullyInside: cr.left >= sr.left && cr.right <= sr.right && cr.top >= sr.top && cr.bottom <= sr.bottom,
        xMargin: cr.left - sr.left,
        cy: cr.top + cr.height / 2,
        sy: sr.top + sr.height / 2,
        dy: cr.top + cr.height / 2 - (sr.top + sr.height / 2),
        aria: b.getAttribute('aria-label')
      };
    });
  })()`);
  const liveReadable = live.filter((b) => parseFloat(b.fontSize) >= 8 && b.color === 'rgb(0, 57, 48)' && b.weight === '800' && b.fullyInside);
  ok('live-bells-readable', live.length > 0 && liveReadable.length === live.length, JSON.stringify(live));
  ok('live-bells-aria-sync', live.every((b) => b.aria && b.aria.includes(b.text)), JSON.stringify(live.map((b) => b.aria)));
  await shot('bell-02-sidebar-expanded');

  // 2) Exact slot geometry testbed
  const geo = await evalJs(`(() => {
    const bed = document.createElement('div');
    bed.id = 'belltest';
    bed.style.cssText = 'position:fixed;top:0;left:0;background:#003930;padding:10px;display:flex;gap:14px;z-index:99999';
    ['6', '14', '16', '30', '99', '99+'].forEach((txt) => {
      const cls = txt.length === 1 ? 'one' : txt.length === 2 ? 'two' : 'wide';
      const b = document.createElement('span');
      b.className = 'sb-bell';
      b.innerHTML = ${JSON.stringify(BELL_SVG)} + '<span class="sb-bell-count sb-bell-count--' + cls + '">' + txt + '</span>';
      bed.appendChild(b);
    });
    document.body.appendChild(bed);
    return [...bed.querySelectorAll('.sb-bell')].map((b) => {
      const svg = b.querySelector('.sb-bell-svg');
      const c = b.querySelector('.sb-bell-count');
      const cs = getComputedStyle(c);
      const sr = svg.getBoundingClientRect();
      const cr = c.getBoundingClientRect();
      return {
        text: c.textContent.trim(),
        fontSize: cs.fontSize,
        color: cs.color,
        box: sr.width.toFixed(1) + 'x' + sr.height.toFixed(1),
        inside: cr.left >= sr.left && cr.right <= sr.right && cr.top >= sr.top && cr.bottom <= sr.bottom,
        xL: (cr.left - sr.left).toFixed(1),
        xR: (sr.right - cr.right).toFixed(1),
        dy: (cr.top + cr.height / 2 - (sr.top + sr.height / 2)).toFixed(1)
      };
    });
  })()`);
  const geoOk = geo.every((g) => g.inside && g.color === 'rgb(0, 57, 48)' && parseFloat(g.xL) >= 0 && parseFloat(g.xR) >= 0);
  const expectedFont = { '6': '12px', '14': '10.5px', '16': '10.5px', '30': '10.5px', '99': '10.5px', '99+': '7.5px' };
  const fontOk = geo.every((g) => g.fontSize === expectedFont[g.text]);
  ok('geo-all-inside', geoOk, JSON.stringify(geo));
  ok('geo-font-slots', fontOk, JSON.stringify(geo.map((g) => g.text + '=' + g.fontSize)));
  ok('geo-vertical-center', geo.every((g) => Math.abs(parseFloat(g.dy)) <= 2), JSON.stringify(geo.map((g) => g.text + ' dy=' + g.dy)));

  // Screenshot testbed, cropped and upscaled for a crisp look at the numbers
  const clip = await evalJs(`(() => {
    const bed = document.getElementById('belltest');
    const r = bed.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  })()`);
  const cap = await cdp.send('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: true,
    clip: { x: clip.x, y: clip.y, width: clip.width, height: clip.height, scale: 3 }
  });
  const dir = path.resolve(__dirname, '..', 'evidence');
  fs.writeFileSync(path.join(dir, 'bell-03-count-slots.png'), Buffer.from(cap.data, 'base64'));

  // Sidebar bell zoom (live data)
  const bellBox = await evalJs(`(() => {
    const b = document.querySelector('.app-sidebar .sb-bell');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.left - 40, y: r.top - 60, width: r.width + 80, height: r.height + 120 };
  })()`);
  if (bellBox) {
    const cap2 = await cdp.send('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: true,
      clip: { ...bellBox, scale: 3 }
    });
    fs.writeFileSync(path.join(dir, 'bell-04-sidebar-zoom.png'), Buffer.from(cap2.data, 'base64'));
  }

  console.log('VERIFY_BELL ' + JSON.stringify(results, null, 2));
};