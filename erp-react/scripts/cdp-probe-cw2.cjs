module.exports = { run: async ({ cdp, sleep, helpers }) => {
  const { evalJs, navigate } = helpers;
  await navigate('http://localhost:5173/cost-workouts/new');
  await sleep(4000);
  // focus the input
  await evalJs(`(() => { const el = document.querySelector('input[placeholder="Search Lead or Client..."]'); if (el) el.focus(); return !!el; })()`);
  await sleep(500);
  // type via CDP Input.insertText (real user typing -> React onChange)
  await cdp.send('Input.insertText', { text: 'AUDIT_LEAD' });
  await sleep(2500);
  const after = await evalJs(`(() => {
    const el = document.querySelector('input[placeholder="Search Lead or Client..."]');
    const dropdowns = Array.from(document.querySelectorAll('button')).filter((b) => b.textContent.includes('Lead No:') || b.textContent.includes('Client Code:'));
    return {
      inputValue: el ? el.value : null,
      active: document.activeElement === el,
      optionCount: dropdowns.length,
      auditOptions: dropdowns.filter((b) => b.textContent.includes('AUDIT')).map((b) => b.textContent.replace(/\s+/g, ' ').trim())
    };
  })()`);
  console.log('CW2_DUMP: ' + JSON.stringify(after));
  console.log('CW2_PROBE_DONE');
}};
