/* CDP download verification for the selected-quotation exports (CSV/Excel/PDF).
 * Usage: node scripts/cdp-driver.cjs 9222 scripts/cdp-verify-downloads.cjs
 */
const fs = require('fs');
const path = require('path');

module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { navigate, waitFor, evalJs, shot } = helpers;
    const dlDir = path.resolve(__dirname, '..', 'evidence', 'cdp-downloads');
    fs.mkdirSync(dlDir, { recursive: true });
    for (const f of fs.readdirSync(dlDir)) fs.unlinkSync(path.join(dlDir, f));

    await cdp.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: dlDir,
      eventsEnabled: true
    });

    const errors = [];
    cdp.on('Runtime.exceptionThrown', (p) =>
      errors.push('EXC: ' + (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text)));
    await cdp.send('Runtime.enable');

    await navigate('http://localhost:5173/quotations');
    await waitFor(`document.querySelectorAll('.qpo-table tbody tr').length > 0`, 30000);

    // Select the first row
    await evalJs(`(() => {
      const cb = document.querySelector('.qpo-table tbody tr input[type="checkbox"]');
      if (cb) cb.click();
    })()`);
    await sleep(600);

    const openMenu = () => evalJs(`(() => {
      const bar = document.querySelector('.qpo-bulk-bar');
      const btn = Array.from(bar.querySelectorAll('button')).find((b) => /^Export/i.test(b.textContent.trim()));
      if (btn) btn.click();
    })()`);

    const clickItem = (label) => evalJs(`(() => {
      const menu = document.querySelector('.qpo-bulk-bar [class*="export-menu"]');
      const btn = Array.from(menu.querySelectorAll('button')).find((b) => b.textContent.trim() === ${JSON.stringify(label)});
      if (btn) btn.click();
    })()`);

    const filesIn = () => fs.readdirSync(dlDir).filter((f) => f.endsWith('.crdownload') === false);

    const results = {};

    // ---- CSV ----
    await openMenu();
    await sleep(300);
    await clickItem('Export to CSV');
    await sleep(2500);
    results.csv = filesIn();

    // ---- Excel ----
    await openMenu();
    await sleep(300);
    await clickItem('Export to Excel');
    await sleep(3000);
    results.excel = filesIn();

    // ---- PDF ----
    await openMenu();
    await sleep(300);
    await clickItem('Export to PDF');
    await sleep(4000);
    results.pdf = filesIn();

    await shot('downloads-after-exports');

    // Report names + first-line sanity of CSV content
    const csvPath = results.csv.find((f) => f.endsWith('.csv'));
    const csvHead = csvPath ? fs.readFileSync(path.join(dlDir, csvPath), 'utf8').split('\r\n').slice(0, 8).join(' | ') : null;

    console.log(JSON.stringify({ results, csvHead, errors }, null, 2));
  }
};
