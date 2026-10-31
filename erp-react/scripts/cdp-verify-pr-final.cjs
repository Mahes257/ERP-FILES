module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { evalJs, navigate, waitFor } = helpers;

    await navigate('http://localhost:5173/payment-receipts');
    await waitFor(`document.body.innerText.length > 100`, 15000);
    await sleep(4000);

    const rows = await evalJs(`(() => ({
      rows: [...document.querySelectorAll('table tbody tr')].slice(0, 5).map((r) => r.textContent.replace(/\\s+/g, ' ').trim().slice(0, 90)),
      info: (document.body.innerText.match(/Showing[^\\n]{0,40}/) || [''])[0]
    }))()`);
    console.log('LIST_ROWS: ' + JSON.stringify(rows));

    const api = await evalJs(`(async () => {
      try {
        const token = localStorage.getItem('token') || '';
        const res = await fetch('/v1/payment-receipts?page=0&size=10', {
          headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }
        });
        const j = await res.json();
        return { status: res.status, shape: Object.keys(j), sample: JSON.stringify(j).slice(0, 400) };
      } catch (e) { return { error: String(e) }; }
    })()`);
    console.log('API_RAW: ' + JSON.stringify(api));
    console.log('FINAL_DONE');
  }
};
