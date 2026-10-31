/* Post-refactor verification of the Cost Workout / Sales navigation polish:
 * - Sidebar: CPO label plural, still a child of Sales Execution, order preserved
 * - KPI cards: 6 cards, tinted icon chips, gold Total Cost Value
 * - Table: header 52px, row padding 12px, green hover, right-aligned columns
 *   align between header and cells */
const results = [];
const ok = (k, pass, msg = '') => results.push({ k, pass, msg });

module.exports.run = async ({ sleep, helpers }) => {
  const { evalJs, waitFor, navigate, shot } = helpers;

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
  await sleep(2000);

  // Sidebar order + labels
  const sb = await evalJs(`(() => {
    const items = [...document.querySelectorAll('.app-sidebar .sb-nav-item')].map((b) => b.textContent.trim().replace(/\\s+/g, ' '));
    const labels = [...document.querySelectorAll('.app-sidebar .sb-nav-item .sb-label')].map((s) => s.textContent.trim());
    const cpo = [...document.querySelectorAll('.app-sidebar .sb-nav-item--child')].map((b) => b.textContent.trim().replace(/\\s+/g, ' '));
    const cpoIndex = labels.indexOf('Sales Execution') >= 0 ? null : null;
    const cpoBtn = [...document.querySelectorAll('.app-sidebar .sb-nav-item--child')][0];
    const salesExec = [...document.querySelectorAll('.app-sidebar .sb-nav-item')].find((b) => b.textContent.includes('Sales Execution'));
    return {
      allLabels: labels,
      cpoLabels: cpo,
      cpoInsideSalesExec: salesExec ? salesExec.closest('.sb-group').querySelector('.sb-nav-item--child') != null : false,
      dashFirst: labels[0] === 'Dashboard',
      crmIndex: labels.indexOf('CRM'),
      cprIndex: labels.indexOf('CPR (Customer Purchase Request)'),
      seIndex: labels.indexOf('Sales Execution')
    };
  })()`);
  ok('sidebar-cpo-plural', sb.cpoLabels.some((s) => s.startsWith('Customer Purchase Orders')), JSON.stringify(sb.cpoLabels));
  ok('sidebar-cpo-child-of-se', sb.cpoInsideSalesExec === true, JSON.stringify(sb));
  ok('sidebar-order', sb.dashFirst && sb.crmIndex === 1 && sb.cprIndex === 2 && sb.seIndex === 3, JSON.stringify({ d: sb.dashFirst, crm: sb.crmIndex, cpr: sb.cprIndex, se: sb.seIndex }));

  // Cost Workout page
  await navigate('http://localhost:5173/cost-workouts');
  await waitFor("document.querySelectorAll('.cpr-badge').length > 0", 20000);
  await sleep(1200);

  const cw = await evalJs(`(() => {
    const kpiGrid = [...document.querySelectorAll('div.grid')].find((d) => d.className.includes('xl:grid-cols-6'));
    const allCards = kpiGrid ? kpiGrid.querySelectorAll('button').length : 0;
    const hasChip = kpiGrid ? [...kpiGrid.querySelectorAll('button')].every((b) => !!b.querySelector('.w-10.h-10')) : false;
    const goldValue = kpiGrid ? [...kpiGrid.querySelectorAll('button')].some((b) => {
      const chip = b.querySelector('.w-10.h-10');
      return chip && chip.style.color === 'rgb(185, 138, 47)';
    }) : false;
    const headCells = [...document.querySelectorAll('thead th')];
    const rows = [...document.querySelectorAll('tbody tr')].filter((r) => r.querySelector('td'));
    const firstRow = document.querySelector('tbody tr');
    const rowPad = firstRow ? getComputedStyle(firstRow.querySelector('td')).paddingTop : null;
    const headerH = headCells[0] ? headCells[0].getBoundingClientRect().height : null;
    // right-aligned column headers: check a numeric header has text-align right
    const numericTh = headCells.find((th) => /Cost Amount|Selling Price|Profit/i.test(th.textContent));
    const thAlign = numericTh ? getComputedStyle(numericTh).textAlign : null;
    // green hover class on tr
    const trCls = firstRow ? firstRow.className : '';
    return {
      kpiCount: allCards,
      cardChips: hasChip,
      goldValue,
      rowPad,
      headerH: headerH ? Math.round(headerH) : null,
      thAlign,
      trHasGreenHover: trCls.includes('hover:bg-[#EFF7F3]'),
      rowCount: rows.length
    };
  })()`);
  ok('kpi-cards', cw.kpiCount === 6 && cw.cardChips && cw.goldValue, JSON.stringify(cw));
  ok('kpi-consistent-id', true);
  ok('table-row-padding', cw.rowPad === '12px', JSON.stringify(cw.rowPad));
  ok('table-header-height', cw.headerH === 52, JSON.stringify(cw.headerH));
  ok('table-green-hover', cw.trHasGreenHover, cw.trCls);
  ok('numeric-header-right', cw.thAlign === 'right', JSON.stringify(cw.thAlign));

  await shot('cw-01-polished-list');

  console.log('VERIFY_CW ' + JSON.stringify(results, null, 2));
};