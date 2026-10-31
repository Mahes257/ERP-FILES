module.exports = { run: async ({ cdp, sleep, helpers }) => {
  const { evalJs, navigate } = helpers;
  await navigate('http://localhost:5173/cprs/new');
  await sleep(4000);

  const dump = await evalJs(`(() => {
    const prNo = document.querySelector('input[placeholder="Auto-generated or enter manually"]');
    const dates = Array.from(document.querySelectorAll('input[type=date]')).map((d) => d.value);
    return { prNo: prNo ? prNo.value : 'NO_INPUT', dateCount: dates.length, dates };
  })()`);
  console.log('CPR_DUMP_INIT: ' + JSON.stringify(dump));

  // set dates via native setter (works for controlled date inputs)
  await evalJs(`(() => {
    const dates = Array.from(document.querySelectorAll('input[type=date]'));
    if (dates[0]) {
      const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      s.call(dates[0], '2026-08-08'); dates[0].dispatchEvent(new Event('input', { bubbles: true })); dates[0].dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (dates[1]) {
      const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      s.call(dates[1], '2026-08-15'); dates[1].dispatchEvent(new Event('input', { bubbles: true })); dates[1].dispatchEvent(new Event('change', { bubbles: true }));
    }
    return dates.length;
  })()`);

  // type department via real CDP typing
  const deptEl = await evalJs(`(() => { const el = document.querySelector('input[placeholder="Type or select department..."]'); if (el) el.focus(); return !!el; })()`);
  console.log('CPR_DEPT_FOCUS: ' + deptEl);
  await cdp.send('Input.insertText', { text: 'AUDIT Department' });
  await sleep(800);
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await sleep(600);

  const reqEl = await evalJs(`(() => { const el = document.querySelector('input[placeholder="Type requester name..."]'); if (el) el.focus(); return !!el; })()`);
  console.log('CPR_REQ_FOCUS: ' + reqEl);
  await cdp.send('Input.insertText', { text: 'AUDIT Requester' });
  await sleep(800);
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await sleep(600);

  const priEl = await evalJs(`(() => { const el = document.querySelector('input[placeholder="Type or select priority..."]'); if (el) el.focus(); return !!el; })()`);
  console.log('CPR_PRIO_FOCUS: ' + priEl);
  await cdp.send('Input.insertText', { text: 'Medium' });
  await sleep(800);
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await sleep(600);

  const afterFill = await evalJs(`(() => {
    const get = (p) => { const el = document.querySelector('input[placeholder=' + JSON.stringify(p) + ']'); return el ? el.value : null; };
    return {
      prNo: get('Auto-generated or enter manually'),
      dept: get('Type or select department...'),
      req: get('Type requester name...'),
      prio: get('Type or select priority...'),
      errors: Array.from(document.querySelectorAll('.text-rose-500')).map((e) => e.textContent.trim()).filter(Boolean).slice(0, 6)
    };
  })()`);
  console.log('CPR_DUMP_FILLED: ' + JSON.stringify(afterFill));

  await evalJs(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.replace(/\s+/g, ' ').trim() === 'Save');
    if (btn) btn.click();
    return !!btn;
  })()`);
  await sleep(5000);
  const after = await evalJs(`(() => ({ path: location.pathname, toast: (document.querySelector('[class*="toast"]') || {}).textContent || '' }))()`);
  console.log('CPR_AFTER_SAVE: ' + JSON.stringify(after));
  console.log('CPR_PROBE_DONE');
}};
