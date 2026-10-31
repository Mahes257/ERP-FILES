/* Verify SC form searchable dropdowns (Lead No / Quotation Ref) open and list real options */
module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { evalJs, navigate, waitFor } = helpers;
    const log = (k, v) => console.log(`${k}: ${JSON.stringify(v)}`);
    const errors = [];
    cdp.on('Runtime.exceptionThrown', (p) =>
      errors.push('EXC: ' + (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text)));
    await cdp.send('Runtime.enable');

    await navigate('http://localhost:5173/sales-contracts/new');
    await waitFor(`document.querySelector('input[placeholder="Select Quotation"]') !== null`);
    await sleep(1500);

    // Simulate a real user: focus the Quotation dropdown and type a character
    const dd = await evalJs(`(() => {
      const input = document.querySelector('input[placeholder="Select Quotation"]');
      if (!input) return { found: false };
      input.focus();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'Q');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return { found: true };
    })()`);
    await sleep(1500);
    const state = await evalJs(`(() => {
      const portals = document.querySelectorAll('div.fixed');
      const openDd = [...portals].find((p) => getComputedStyle(p).zIndex === '9999');
      if (!openDd) return { dropdownOpen: false };
      const rows = [...openDd.querySelectorAll('button')];
      return { dropdownOpen: true, optionRows: rows.length, sample: rows.slice(0, 3).map((b) => b.textContent.trim()) };
    })()`);
    log('SC_QTN_DROPDOWN', state);

    // Same for Lead No
    await evalJs(`(() => {
      const input = document.querySelector('input[placeholder="Select Lead"]');
      if (!input) return { found: false };
      input.focus();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'L');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return { found: true };
    })()`);
    await sleep(1500);
    const leadState = await evalJs(`(() => {
      const portals = document.querySelectorAll('div.fixed');
      const openDd = [...portals].find((p) => getComputedStyle(p).zIndex === '9999');
      if (!openDd) return { dropdownOpen: false };
      return { dropdownOpen: true, optionRows: openDd.querySelectorAll('button').length };
    })()`);
    log('SC_LEAD_DROPDOWN', leadState);

    log('CONSOLE_ERRORS', errors);
    return {};
  }
};
