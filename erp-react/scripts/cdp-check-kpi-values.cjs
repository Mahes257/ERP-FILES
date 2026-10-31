/* Read KPI card values (counts/amounts) to confirm real backend data is shown,
 * including multi-word statuses (Pending Review, In Progress, In Transit, Pending). */
module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { navigate, waitFor, evalJs } = helpers;

    const base = 'http://localhost:5173';
    await navigate(base + '/sales-orders');
    await waitFor(`document.querySelector('.sales-kpi-grid')`, 25000);
    await sleep(1500);

    const so = await evalJs(`(() =>
      Array.from(document.querySelectorAll('.sales-kpi-grid button')).map((c) => {
        const v = c.querySelector('.text-base.font-bold');
        const l = c.querySelector('.text-\\\\[10px\\\\]');
        return (v ? v.textContent.trim() : '?') + ' | ' + (l ? l.textContent.trim() : '?');
      }))()`);

    await navigate(base + '/credit-notes');
    await waitFor(`document.querySelector('.sales-kpi-grid')`, 25000);
    await sleep(1500);

    const cn = await evalJs(`(() =>
      Array.from(document.querySelectorAll('.sales-kpi-grid button')).map((c) => {
        const v = c.querySelector('.text-base.font-bold');
        const l = c.querySelector('.text-\\\\[10px\\\\]');
        return (v ? v.textContent.trim() : '?') + ' | ' + (l ? l.textContent.trim() : '?');
      }))()`);

    await navigate(base + '/delivery-challans');
    await waitFor(`document.querySelector('.sales-kpi-grid')`, 25000);
    await sleep(1500);

    const dc = await evalJs(`(() =>
      Array.from(document.querySelectorAll('.sales-kpi-grid button')).map((c) => {
        const v = c.querySelector('.text-base.font-bold');
        const l = c.querySelector('.text-\\\\[10px\\\\]');
        return (v ? v.textContent.trim() : '?') + ' | ' + (l ? l.textContent.trim() : '?');
      }))()`);

    console.log(JSON.stringify({ salesOrders: so, creditNotes: cn, deliveryChallans: dc }, null, 2));
  }
};
