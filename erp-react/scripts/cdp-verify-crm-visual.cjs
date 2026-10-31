/* Measure the rendered CRM pages' computed styles and compare against the ERP
   CSS specs (kpi-value 28px, kpi-label 13px/#9CA3AF, header h1 24px,
   bulk-bar #E8F0EE, 5-col KPI grid, segmented control, table th/td padding). */
module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { evalJs, navigate, waitFor } = helpers;

    await navigate('http://localhost:5173/signin');
    await waitFor(`document.querySelector('input[type="email"], input[name="email"]') !== null`, 15000);
    await sleep(500);
    await evalJs(`(() => {
      const setVal = (el, v) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      const email = document.querySelector('input[type="email"], input[name="email"]');
      const pass = document.querySelector('input[type="password"]');
      if (email) setVal(email, 'admin@vishaktech.com');
      if (pass) setVal(pass, 'Admin@123');
    })()`);
    await sleep(400);
    await evalJs(`[...document.querySelectorAll('button')].find((b) => /sign\\s*in/i.test(b.textContent || ''))?.click()`);
    await waitFor(`location.pathname !== '/signin'`, 20000);
    await sleep(2500);

    const measure = (route) => {
      return evalJs(`(() => {
        const cs = (sel, prop) => {
          const el = document.querySelector(sel);
          return el ? getComputedStyle(el)[prop] : null;
        };
        const kpiVal = document.querySelector('.crm-erp-kpi-card .crm-erp-kpi-value');
        const kpiLbl = document.querySelector('.crm-erp-kpi-card .crm-erp-kpi-label');
        const grid = document.querySelector('.crm-erp-kpi-grid');
        const cards = document.querySelectorAll('.crm-erp-kpi-card');
        const th = document.querySelector('.crm-erp-table-card thead th');
        const td = document.querySelector('.crm-erp-table-card tbody td');
        const seg = document.querySelector('.crm-erp-segmented');
        const bulk = document.querySelector('.crm-erp-bulk-bar');
        const h1 = document.querySelector('.crm-erp-page-header h1');
        const firstRow = document.querySelector('.crm-erp-table-card tbody tr');
        return {
          kpiValueFont: kpiVal ? getComputedStyle(kpiVal).fontSize : null,
          kpiLabelFont: kpiLbl ? getComputedStyle(kpiLbl).fontSize : null,
          kpiLabelColor: kpiLbl ? getComputedStyle(kpiLbl).color : null,
          kpiLabelUppercase: kpiLbl ? getComputedStyle(kpiLbl).textTransform : null,
          gridCols: grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : null,
          kpiCardCount: cards.length,
          kpiCardHeight: cards[0] ? Math.round(cards[0].getBoundingClientRect().height) : null,
          thFont: th ? getComputedStyle(th).fontSize : null,
          thBg: th ? getComputedStyle(th).backgroundColor : null,
          thPadding: th ? getComputedStyle(th).padding : null,
          tdPadding: td ? getComputedStyle(td).padding : null,
          rowHeight: firstRow ? Math.round(firstRow.getBoundingClientRect().height) : null,
          segRadius: seg ? getComputedStyle(seg).borderRadius : null,
          bulkBg: bulk ? getComputedStyle(bulk).backgroundColor : null,
          h1Font: h1 ? getComputedStyle(h1).fontSize : null,
          pageW: Math.round(document.querySelector('.crm-erp-page')?.getBoundingClientRect().width || 0)
        };
      })()`);
    };

    const routes = ['/clients', '/leads', '/followups'];
    for (const route of routes) {
      await navigate('http://localhost:5173' + route);
      await sleep(2500);
      const m = await measure(route);
      const ok =
        m.kpiValueFont === '28px' &&
        m.kpiLabelFont === '13px' &&
        m.kpiLabelColor === 'rgb(156, 163, 175)' &&
        (m.kpiLabelUppercase === 'none' || !m.kpiLabelUppercase) &&
        m.gridCols === 5 &&
        m.h1Font === '24px';
      console.log((ok ? 'PASS | ' : 'FAIL | ') + route + '  ' + JSON.stringify(m));
    }
    console.log('VISUAL_DONE');
  }
};
