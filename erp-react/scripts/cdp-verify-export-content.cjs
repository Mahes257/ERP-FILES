/* Sign in, trigger the quotation CSV export, and intercept the generated blob to
   verify the exported content contains the selected quotation's real data. */
module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { evalJs, navigate, waitFor } = helpers;
    const log = (k, v) => console.log(`${k}: ${JSON.stringify(v)}`);
    const errors = [];
    cdp.on('Runtime.exceptionThrown', (p) =>
      errors.push('EXC: ' + (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text)));
    await cdp.send('Runtime.enable');

    // ---- Sign in ----
    await navigate('http://localhost:5173/signin');
    await waitFor(`document.querySelector('input[type=\"email\"], input[name=\"email\"]') !== null`);
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
      return true;
    })()`);
    await sleep(400);
    await evalJs(`(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => /sign\\s*in/i.test(b.textContent || ''));
      if (btn) btn.click();
      return !!btn;
    })()`);
    await waitFor(`location.pathname !== '/signin'`, 20000);
    await sleep(2500);

    // ---- Quotations list ----
    await navigate('http://localhost:5173/quotations');
    await waitFor(`document.querySelector('.qpo-table tbody') !== null`);
    await sleep(1500);

    // Install blob interceptor BEFORE exporting
    await evalJs(`(() => {
      window.__capturedExports = [];
      const orig = URL.createObjectURL.bind(URL);
      URL.createObjectURL = (blob) => {
        const url = orig(blob);
        const reader = new FileReader();
        reader.onloadend = () => {
          const text = typeof reader.result === 'string' ? reader.result.slice(0, 2000) : '';
          const bytes = typeof blob.size === 'number' ? blob.size : 0;
          window.__capturedExports.push({ type: blob.type, size: bytes, head: text.slice(0, 400) });
        };
        if (blob.type.includes('text') || blob.type.includes('csv')) reader.readAsText(blob);
        else reader.readAsArrayBuffer(blob);
        return url;
      };
      return true;
    })()`);

    // Select the first row
    await evalJs(`(() => {
      const box = document.querySelector('.qpo-table tbody input[type="checkbox"]');
      if (box) box.click();
      return !!box;
    })()`);
    await sleep(800);

    const qtnNo = await evalJs(`(() => {
      const row = document.querySelector('.qpo-table tbody tr');
      return row ? (row.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 100) : 'N/A';
    })()`);
    log('SELECTED_ROW', { qtnNo });

    const runExport = async (label) => {
      await evalJs(`(() => {
        const bulkBar = document.querySelector('.qpo-bulk-bar.visible');
        const btn = [...bulkBar.querySelectorAll('button')].find((b) => (b.textContent || '').includes('Export'));
        if (btn) btn.click();
        return true;
      })()`);
      await sleep(500);
      const clicked = await evalJs(`(() => {
        const bulkBar = document.querySelector('.qpo-bulk-bar.visible');
        const menu = bulkBar ? bulkBar.querySelector('[class*="export-menu"]') : null;
        if (!menu) return false;
        const item = [...menu.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === ${JSON.stringify(label)});
        if (item) { item.click(); return true; }
        return false;
      })()`);
      await sleep(3500);
      const captured = await evalJs(`window.__capturedExports.slice(-1)`);
      log(`EXPORT_${label.replace(/[^A-Za-z]/g, '_').toUpperCase()}`, { clicked, captured });
    };

    await runExport('Export to CSV');
    await runExport('Export to Excel');
    await runExport('Export to PDF');

    log('CONSOLE_ERRORS', errors);
    console.log('CDP_SCRIPT_DONE');
  }
};
