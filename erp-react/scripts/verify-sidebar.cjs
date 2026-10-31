/* Sidebar visual-theme verification (deep-green + skin/beige + gold).
 * Confirms hierarchy styling, active pill, level-3 CPO nesting, footer utils,
 * and that bells still sit correctly. */
const fs = require('fs');
const path = require('path');
const results = [];
const ok = (k, pass, msg = '') => results.push({ k, pass, msg });

module.exports.run = async ({ cdp, sleep, helpers }) => {
  const { evalJs, navigate, waitFor, shot } = helpers;
  const dir = path.resolve(__dirname, '..', 'evidence');

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
  await sleep(2500);

  // Expand all branches so the full hierarchy is visible
  await evalJs(`(() => {
    [...document.querySelectorAll('.sb-group')].forEach((g) => {
      const btn = g.querySelector('.sb-nav-item');
      const open = g.getAttribute('data-open') === 'true';
      if (!open && btn && !btn.classList.contains('is-disabled')) btn.click();
    });
  })()`);
  await sleep(900);

  // Navigate to a leaf to exercise the active pill (Leads under CRM)
  const leadBtn = await evalJs(`(() => {
    const btns = [...document.querySelectorAll('.app-sidebar .sb-subitem')];
    const b = btns.find((x) => x.textContent.trim() === 'Leads');
    if (b) b.click();
    return !!b;
  })()`);
  ok('nav-to-leads', leadBtn);
  await waitFor("location.pathname === '/leads'", 15000);
  await sleep(800);

  const audit = await evalJs(`(() => {
    const q = (sel) => sel === '.app-sidebar' ? document.querySelector(sel) : document.querySelector('.app-sidebar ' + sel);
    const all = (sel) => [...document.querySelectorAll('.app-sidebar ' + sel)];
    const css = (el, p) => el ? getComputedStyle(el)[p] : null;
    const rgb = (c) => {
      const m = c && c.match(/rgba?\\((\\d+), (\\d+), (\\d+)/);
      return m ? [+m[1], +m[2], +m[3]] : null;
    };
    const sb = q('.app-sidebar');
    const sbBg = css(sb, 'backgroundColor');
    const heading = q('.sb-sales-heading-label');
    const topItems = all('.sb-nav-item').filter((b) => !b.classList.contains('sb-nav-item--child'));
    const crm = topItems.find((b) => b.textContent.trim().startsWith('CRM'));
    const cpo = q('.sb-nav-item--child');
    const sub2 = all('.sb-subitem').find((b) => !b.classList.contains('sb-subitem--level3'));
    const sub3 = q('.sb-subitem--level3');
    const active = q('.sb-subitem.is-active');
    const footerBtns = all('.sb-bottom .sb-nav-item');
    const bell = q('.sb-bell');
    const bellSvg = bell && bell.querySelector('.sb-bell-svg');
    const bellCount = bell && bell.querySelector('.sb-bell-count');
    const br = bellSvg && bellSvg.getBoundingClientRect();
    const cr = bellCount && bellCount.getBoundingClientRect();
    return {
      sbBg: rgb(sbBg),
      headingText: heading ? heading.textContent : null,
      headingColor: heading ? css(heading, 'color') : null,
      headingSize: heading ? css(heading, 'fontSize') : null,
      headingLs: heading ? css(heading, 'letterSpacing') : null,
      crmColor: crm ? css(crm, 'color') : null,
      crmWeight: crm ? css(crm, 'fontWeight') : null,
      sub2Margin: sub2 ? css(sub2, 'marginLeft') : null,
      sub2Font: sub2 ? css(sub2, 'fontSize') : null,
      sub2Color: sub2 ? css(sub2, 'color') : null,
      sub3Class: sub3 ? sub3.className : null,
      sub3Margin: sub3 ? css(sub3, 'marginLeft') : null,
      sub3Font: sub3 ? css(sub3, 'fontSize') : null,
      cpoClass: cpo ? cpo.className : null,
      cpoMargin: cpo ? css(cpo, 'marginLeft') : null,
      activeBg: active ? rgb(css(active, 'backgroundColor')) : null,
      activeColor: active ? rgb(css(active, 'color')) : null,
      activeWeight: active ? css(active, 'fontWeight') : null,
      footerCount: footerBtns.length,
      footerFirstColor: footerBtns[0] ? css(footerBtns[0], 'color') : null,
      footerSeparator: footerBtns[1] ? (getComputedStyle(footerBtns[1]).borderTopWidth) : null,
      bellInside: bell ? (cr.left >= br.left && cr.right <= br.right && cr.top >= br.top && cr.bottom <= br.bottom) : null,
      bellCountText: bellCount ? bellCount.textContent : null,
      leafCount: all('.sb-subitem').length,
      level3Count: all('.sb-subitem--level3').length
    };
  })()`);

  ok('sidebar-deep-green-bg', audit.sbBg && audit.sbBg[0] >= 0 && audit.sbBg[0] <= 40 && audit.sbBg[1] >= 30 && audit.sbBg[1] <= 90 && audit.sbBg[2] >= 30 && audit.sbBg[2] <= 90, JSON.stringify({ sbBg: audit.sbBg }));
  ok('sales-heading', audit.headingText === 'SALES' && parseFloat(audit.headingSize) <= 11 && audit.headingColor && audit.headingColor.includes('232, 201, 181'), JSON.stringify(audit.headingText + ' ' + audit.headingSize + ' ' + audit.headingColor));
  ok('top-item-cream', audit.crmColor && audit.crmColor.includes('231') && parseFloat(audit.crmWeight) >= 600, JSON.stringify({ crmColor: audit.crmColor, w: audit.crmWeight }));
  ok('subitem-indent', audit.sub2Margin === '40px' && parseFloat(audit.sub2Font) <= 12, JSON.stringify({ m: audit.sub2Margin, f: audit.sub2Font }));
  ok('level3-nesting', audit.sub3Class && audit.sub3Class.includes('sb-subitem--level3') && audit.sub3Margin === '56px' && parseFloat(audit.sub3Font) < parseFloat(audit.sub2Font), JSON.stringify({ c: audit.sub3Class, m: audit.sub3Margin, f: audit.sub3Font }));
  ok('cpo-child-group', audit.cpoClass && audit.cpoClass.includes('sb-nav-item--child') && audit.cpoMargin === '56px', JSON.stringify({ c: audit.cpoClass, m: audit.cpoMargin }));
  ok('active-pill', audit.activeBg && Math.abs(audit.activeBg[0] - 232) < 12 && Math.abs(audit.activeBg[1] - 201) < 12 && audit.activeColor && audit.activeColor[1] <= 70, JSON.stringify({ bg: audit.activeBg, fg: audit.activeColor, w: audit.activeWeight }));
  ok('footer-utils', audit.footerCount === 4 && audit.footerSeparator && audit.footerSeparator !== '0px', JSON.stringify({ n: audit.footerCount, sep: audit.footerSeparator }));
  ok('bell-inside', audit.bellInside === true, JSON.stringify({ t: audit.bellCountText }));
  ok('hierarchy-depths', audit.level3Count === 4 && audit.leafCount >= 16, JSON.stringify({ l3: audit.level3Count, leaves: audit.leafCount }));

  await shot('sb-01-full-hierarchy');
  await sleep(300);

  // Zoomed crops: SALES heading + active pill
  const zoom = (sel, file, pad = 30) => evalJs(`(() => {
    const el = document.querySelector('.app-sidebar ' + ${JSON.stringify(sel)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left - ${pad}, y: r.top - ${pad}, width: r.width + ${pad} * 2, height: r.height + ${pad} * 2 };
  })()`).then(async (c) => {
    if (!c) return;
    const cap = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { ...c, scale: 3 } });
    fs.writeFileSync(path.join(dir, file), Buffer.from(cap.data, 'base64'));
  });
  await zoom('.sb-sales-heading', 'sb-02-sales-heading.png');
  await zoom('.sb-subitem.is-active', 'sb-03-active-pill.png', 40);
  await zoom('.sb-nav-item--child', 'sb-04-cpo-group.png', 45);

  console.log('VERIFY_SIDEBAR ' + JSON.stringify(results, null, 2));
};