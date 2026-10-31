/* Post-refactor brand verification: login logo, sidebar lockups, doc header plate,
 * favicon, and print/PDF HTML builders all use the official logo assets. */
const results = [];
const ok = (k, pass, msg = '') => results.push({ k, pass, msg });

module.exports.run = async ({ cdp, sleep, helpers }) => {
  const { evalJs, navigate, waitFor, shot } = helpers;

  // 1) Favicon + title
  await navigate('http://localhost:5173/');
  const fav = await evalJs(`(async () => {
    const icon = await fetch('/vishak-tech-favicon.png');
    const htmlText = await (await fetch('/')).text();
    return { iconOk: icon.ok, iconType: icon.headers.get('content-type'),
             htmlClean: !htmlText.includes('favicon.svg'), htmlHasPng: htmlText.includes('vishak-tech-favicon.png'),
             title: document.title };
  })()`);
  ok('favicon-plate', fav.iconOk, `vishak-tech-favicon.png -> ${fav.iconType}`);
  ok('favicon-clean', fav.htmlClean === true && fav.htmlHasPng === true, JSON.stringify(fav));
  ok('page-title', /VISHAK/i.test(fav.title), fav.title);
  await shot('01-index');

  // 2) Sign-in page: official lockup, no broken file
  await navigate('http://localhost:5173/signin');
  const sig = await evalJs(`(() => {
    const img = document.querySelector('img[alt="Vishak Tech"]');
    if (!img) return { found: false };
    return { found: true, dataUri: img.src.startsWith('data:image/png') && img.src.length > 200000,
             w: img.naturalWidth, h: img.naturalHeight, broken: img.naturalWidth === 0 };
  })()`);
  ok('signin-logo', sig.found && sig.dataUri && !sig.broken, JSON.stringify(sig));
  await shot('02-signin');

  // 3) Login
  await evalJs(`(() => {
    const set = (sel, v) => {
      const el = document.querySelector(sel);
      if (!el) return;
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    set('input[type="email"], input[name="email"], #email', 'admin@vishaktech.com');
    set('input[type="password"]', 'Admin@123');
    const btn = document.querySelector('button[type="submit"]');
    if (btn) btn.click();
  })()`);
  const logged = await waitFor("document.querySelector('.app-sidebar')", 20000).then(() => true).catch((e) => { console.error('login waitFor', e.message); return false; });
  ok('login', logged, logged ? 'dashboard reached' : 'login failed / timeout');

  // 4) Expanded sidebar (desktop)
  const exp = await evalJs(`(() => {
    const rail = document.querySelector('.app-sidebar');
    if (!rail) return { rail: false };
    const cs = getComputedStyle(rail);
    const full = document.querySelector('.sb-logo .sb-logo-img');
    const emb = document.querySelector('.sb-logo .sb-logo-emblem');
    const fs = full ? getComputedStyle(full) : null;
    const es = emb ? getComputedStyle(emb) : null;
    return {
      rail: true, expanded: rail.classList.contains('expanded'),
      logoDisp: fs ? fs.display : null, logoH: fs ? fs.height : null, logoW: full ? full.offsetWidth : null,
      emblDisp: es ? es.display : null, emblH: es ? es.height : null,
      hScroll: rail.scrollWidth > rail.clientWidth + 1,
      onDark: !!full && full.getBoundingClientRect().width >= 100
    };
  })()`);
  ok('sidebar-expanded-img', exp.rail && exp.expanded && exp.logoDisp !== 'none' && exp.logoH === '38px', JSON.stringify(exp));
  ok('sidebar-expanded-emblem-hidden', exp.emblDisp === 'none', JSON.stringify(exp));
  ok('sidebar-no-hscroll', !exp.hScroll, JSON.stringify(exp));
  await shot('03-sidebar-expanded');

  // 5) Collapsed icon rail (mobile width)
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(1500);
  const col = await evalJs(`(() => {
    const rail = document.querySelector('.app-sidebar');
    if (!rail || !rail.classList.contains('app-sidebar--mobile')) return { rail: false, mobile: false };
    const full = document.querySelector('.sb-logo .sb-logo-img');
    const emb = document.querySelector('.sb-logo .sb-logo-emblem');
    const fs = full ? getComputedStyle(full) : null;
    const es = emb ? getComputedStyle(emb) : null;
    return { rail: true, mobile: true, open: rail.classList.contains('is-open'),
             logoDisp: fs ? fs.display : null, emblDisp: es ? es.display : null, emblH: es ? es.height : null,
             centered: fs && full ? (() => {
               const lr = rail.getBoundingClientRect(); const ir = full.getBoundingClientRect();
               return Math.abs((ir.left + ir.right) / 2 - (lr.left + lr.right) / 2) < 6;
             })() : null };
  })()`);
  await shot('04-sidebar-collapsed');
  await cdp.send('Emulation.clearDeviceMetricsOverride');
  await sleep(800);

  // 6) Cost Workout design sheet header plate logo
  await navigate('http://localhost:5173/cost-workouts/design');
  const cw = await evalJs(`(() => {
    const imgs = [...document.querySelectorAll('img')].filter(i => i.src.startsWith('data:image/png') && i.src.length > 100000);
    const big = imgs.filter(i => i.offsetWidth >= 80);
    return { brandImgs: imgs.length, bigOnSheet: big.length };
  })()`);
  ok('costworkout-plate', cw.brandImgs >= 1, JSON.stringify(cw));
  await shot('05-costworkout-design');

  // 7) Print/PDF HTML builders carry the official plate, not text brand
  const print = await evalJs(`(async () => {
    const out = {};
    try {
      const sp = await import('/src/utils/salesPrintUtils.js');
      const html = sp.buildSalesPrintHtml({ items: [], taxType: 'IGST', status: 'Draft' }, 'Quotation', 'quotation');
      out.quotationHasImg = html.includes('class="brand-img"');
      out.quotationHasPlate = html.includes('/9j/') || html.includes('data:image/png');
      out.quotationNoTextBrand = !/>\\s*VISHAK TECH\\s*</.test(html);
    } catch (e) { out.quotationErr = String(e && e.message); }
    try {
      const cp = await import('/src/utils/cprExportUtils.js');
      const html = cp.buildCprPrintHtml({ items: [], status: 'Draft' }, 'Purchase Request');
      out.cprHasImg = html.includes('class="brand-img"');
      out.cprHasPlate = html.includes('data:image/png');
      out.cprNoTextBrand = !/>\\s*VISHAK TECH\\s*</.test(html);
    } catch (e) { out.cprErr = String(e && e.message); }
    return out;
  })()`);
  ok('print-quotation', !!print.quotationHasImg && !!print.quotationHasPlate && !!print.quotationNoTextBrand, JSON.stringify(print));
  ok('print-cpr', !!print.cprHasImg && !!print.cprHasPlate && !!print.cprNoTextBrand, JSON.stringify(print));

  // Report
  console.log('VERIFY_RESULTS ' + JSON.stringify(results, null, 2));
};