/* ERP alignment verification:
 * 1. Sales Contracts list: 8 KPI cards in a 5-column grid (5×2) — .scp-kpi-cards
 * 1b. Sales Orders list: 8 KPI cards in .sales-kpi-grid 5 columns
 * 2. Sidebar order: Quotations → SC → SO → DC → PI → Invoices → PR → CN
 * 3. SC create page: Quotation Ref qtnPicker button present; Create New Customer button present
 * 4. Quotation list: toolbar Export menu has 4 options (PDF/Excel/CSV/Print); bulk Export has CSV/Excel/PDF/Print/Edit PDF
 */
module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { evalJs, navigate, waitFor } = helpers;
    const log = (k, v) => console.log(`${k}: ${JSON.stringify(v)}`);
    const errors = [];
    cdp.on('Runtime.exceptionThrown', (p) =>
      errors.push('EXC: ' + (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text)));
    await cdp.send('Runtime.enable');

    // ---- 1. Sales Contracts list: 5-col KPI grid (scp-kpi-cards) ----
    await navigate('http://localhost:5173/sales-contracts');
    await waitFor(`document.querySelector('.scp-kpi-cards') !== null`);
    const sc = await evalJs(`(() => {
      const grid = document.querySelector('.scp-kpi-cards');
      const style = grid ? getComputedStyle(grid) : null;
      const labels = [...grid.querySelectorAll('button')].map((b) => (b.textContent || '').replace(/\\s+/g, ' ').trim());
      return { gridClass: grid ? grid.className : 'MISSING', columns: style ? style.gridTemplateColumns : null, cardCount: labels.length, labels };
    })()`);
    log('SC_GRID', sc);

    // ---- 1b. Sales Orders list: .sales-kpi-grid 5 columns ----
    await navigate('http://localhost:5173/sales-orders');
    await waitFor(`document.querySelector('.sales-kpi-grid') !== null`);
    const soGrid = await evalJs(`(() => {
      const grid = document.querySelector('.sales-kpi-grid');
      const style = grid ? getComputedStyle(grid) : null;
      return { columns: style ? style.gridTemplateColumns : null, cardCount: grid ? grid.querySelectorAll('button').length : 0 };
    })()`);
    log('SO_GRID', soGrid);

    // ---- 2. Sidebar order ----
    const side = await evalJs(`(() => {
      const group = document.querySelector('#sb-sales-execution');
      if (!group) return { found: false };
      const items = [...group.querySelectorAll('.sb-subitem')].map((b) => b.textContent.trim().replace(/Coming Soon/g, '').trim());
      return { found: true, items };
    })()`);
    log('SIDEBAR', side);

    // ---- 3. SC create page: module-linked Lead No / Quotation Ref dropdowns + Create New Customer ----
    await navigate('http://localhost:5173/sales-contracts/new');
    await waitFor(`document.querySelector('input[placeholder="Select Lead"]') !== null`);
    const scForm = await evalJs(`(() => {
      const leadNo = document.querySelector('input[placeholder="Select Lead"]');
      const qtnRef = document.querySelector('input[placeholder="Select Quotation"]');
      const createCustomer = [...document.querySelectorAll('button')].filter((b) => (b.textContent || '').includes('Create New Customer'));
      return { leadSelect: !!leadNo, quotationSelect: !!qtnRef, createCustomer: createCustomer.length };
    })()`);
    log('SC_FORM', scForm);

    // Open the Quotation dropdown (SearchableSelect) and confirm real options load
    await evalJs(`(() => {
      const input = document.querySelector('input[placeholder="Select Quotation"]');
      if (input) { input.focus(); input.click(); }
      return true;
    })()`);
    await sleep(1800);
    const pickerState = await evalJs(`(() => {
      const portals = document.querySelectorAll('div.fixed');
      const openDd = [...portals].find((p) => p.style.zIndex === '9999' && p.querySelectorAll('button').length > 0);
      const rows = openDd ? openDd.querySelectorAll('button').length : 0;
      return { dropdownOpen: !!openDd, optionRows: rows };
    })()`);
    log('QTN_DROPDOWN', pickerState);

    // ---- 4. Quotation list export menus ----
    await navigate('http://localhost:5173/quotations');
    await waitFor(`document.querySelector('.qpo-toolbar-right') !== null`);
    await evalJs(`(() => {
      const btn = [...document.querySelectorAll('.qpo-toolbar-right button')].find((b) => (b.textContent || '').includes('Export'));
      if (btn) btn.click();
      return true;
    })()`);
    await sleep(600);
    const exportMenu = await evalJs(`(() => {
      const menu = document.querySelector('.qpo-toolbar-right [class*="export-menu"]');
      if (!menu) return { menuOpen: false };
      return { menuOpen: true, items: [...menu.querySelectorAll('button')].map((b) => b.textContent.trim()) };
    })()`);
    log('QTN_EXPORT_MENU', exportMenu);

    // Select a row → bulk bar Export (must be exactly one button with 5 items)
    await evalJs(`(() => {
      const box = document.querySelector('.qpo-table tbody input[type="checkbox"]');
      if (box) box.click();
      return !!box;
    })()`);
    await sleep(800);
    const bulkState = await evalJs(`(() => {
      const bulkBar = document.querySelector('.qpo-bulk-bar.visible');
      if (!bulkBar) return { bulkBarVisible: false };
      const exportBtns = [...bulkBar.querySelectorAll('button')].filter((b) => (b.textContent || '').includes('Export'));
      if (exportBtns[0]) exportBtns[0].click();
      return { bulkBarVisible: true, exportBtnCount: exportBtns.length };
    })()`);
    await sleep(600);
    const bulkMenu = await evalJs(`(() => {
      const bulkBar = document.querySelector('.qpo-bulk-bar.visible');
      const menu = bulkBar ? bulkBar.querySelector('[class*="export-menu"]') : null;
      if (!menu) return { bulkMenuOpen: false };
      return { bulkMenuOpen: true, items: [...menu.querySelectorAll('button')].map((b) => b.textContent.trim()) };
    })()`);
    log('QTN_BULK_EXPORT', { ...bulkState, ...bulkMenu });

    log('CONSOLE_ERRORS', errors);
    return {};
  }
};
