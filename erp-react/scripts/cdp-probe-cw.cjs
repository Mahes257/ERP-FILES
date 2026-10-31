module.exports = { run: async ({ cdp, sleep, helpers }) => {
  const { evalJs, navigate } = helpers;
  await navigate('http://localhost:5173/cost-workouts/new');
  await sleep(4000);
  const dump = await evalJs(`(async () => {
    const el = document.querySelector('input[placeholder="Search Lead or Client..."]');
    if (!el) return { found: false };
    el.focus();
    el.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, 'AUDIT_LEAD');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return { found: true, value: el.value };
  })()`);
  console.log('CW_DUMP_TYPED: ' + JSON.stringify(dump));
  await sleep(3000);
  const after = await evalJs(`(() => {
    const dropdowns = Array.from(document.querySelectorAll('button')).filter((b) => b.textContent.includes('Lead No:') || b.textContent.includes('Client Code:'));
    return {
      optionCount: dropdowns.length,
      optionTexts: dropdowns.slice(0, 8).map((b) => b.textContent.replace(/\s+/g, ' ').trim()),
      auditOptions: dropdowns.filter((b) => b.textContent.includes('AUDIT')).map((b) => b.textContent.replace(/\s+/g, ' ').trim())
    };
  })()`);
  console.log('CW_DUMP_OPTIONS: ' + JSON.stringify(after));
  console.log('CW_PROBE_DONE');
}};
