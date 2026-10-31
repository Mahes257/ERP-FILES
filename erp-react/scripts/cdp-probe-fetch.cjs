const N = '(function(t){return String(t).replace(/s/gi,"").replace(/[^a-z0-9 ]/gi," ").replace(/\s+/g," ").trim();})';
module.exports = { run: async ({ cdp, sleep, helpers }) => {
  const { evalJs, navigate } = helpers;

  await navigate('http://localhost:5173/sales-contracts/new');
  await sleep(4500);

  await evalJs(`(() => {
    if (window.__cap) return true;
    window.__cap = [];
    const orig = window.fetch;
    window.fetch = function (input, init) {
      const url = typeof input === 'string' ? input : input.url;
      return orig.apply(this, arguments).then(async (res) => {
        if (url.includes('/v1/')) {
          let body = null;
          try { body = await res.clone().text(); } catch (e) {}
          window.__cap.push({ url: url.slice(0, 120), method: (init && init.method) || 'GET', status: res.status, body: body ? body.slice(0, 300) : null });
        }
        return res;
      });
    };
    return true;
  })()`);

  await evalJs(`(() => { const el = document.querySelector('input[aria-label="Client"]'); if (el) el.focus(); return !!el; })()`);
  await sleep(300);
  await cdp.send('Input.insertText', { text: 'SK ' });
  await sleep(2000);
  await evalJs(`(() => {
    const opts = Array.from(document.querySelectorAll('button')).filter((b) => b.textContent.includes('SK Logistics'));
    if (opts[0]) opts[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    return opts.length;
  })()`);
  await sleep(600);

  await evalJs(`(() => {
    const target = ${JSON.stringify('addnewline')};
    const btn = Array.from(document.querySelectorAll('button')).find((b) => ${N}(b.textContent) === target);
    if (btn) btn.click();
    return !!btn;
  })()`);
  await sleep(1000);
  await evalJs(`(() => {
    const el = document.querySelector('input[placeholder="Item description"]');
    if (!el) return false;
    const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    s.call(el, 'AUDIT_ITEM_20260808');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    const trs = Array.from(document.querySelectorAll('tbody tr'));
    const row = trs[trs.length - 1];
    const ins = row.querySelectorAll('input');
    const set = (i, v) => { const s2 = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s2.call(ins[i], v); ins[i].dispatchEvent(new Event('input', { bubbles: true })); ins[i].dispatchEvent(new Event('change', { bubbles: true })); };
    set(3, '2'); set(4, '500');
    return true;
  })()`);
  await sleep(600);

  const pre = await evalJs(`(() => {
    const client = document.querySelector('input[aria-label="Client"]');
    return { val: client ? client.value : null };
  })()`);
  console.log('FETCH_PRE: ' + JSON.stringify(pre));

  await evalJs(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => b.className.includes('032f25') && !b.disabled);
    if (btn) btn.click();
    return !!btn;
  })()`);
  await sleep(3000);
  const cap = await evalJs(`(() => ({ path: location.pathname, calls: window.__cap || [] }))()`);
  console.log('FETCH_CAP: ' + JSON.stringify(cap));
  console.log('FETCH_PROBE_DONE');
}};
